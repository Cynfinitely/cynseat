// pages/api/handlePurchase.ts

import { NextApiRequest, NextApiResponse } from "next";
import admin from "../../firebase/firebaseAdmin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import { Bucket } from "@google-cloud/storage";
import crypto from "crypto";
import path from "path";

export default async function handlePurchase(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const purchase = req.body;
    const numTickets = purchase.numTickets; // Get the number of tickets from the purchase

    // Check if numTickets is valid
    if (!numTickets || numTickets <= 0) {
      return res.status(400).json({ message: "Invalid number of tickets." });
    }

    // Reference to the 'nextNumber' document
    const ticketNumberRef = admin.firestore().doc("tickets/nextNumber");

    // Reference to the user's ticket count document
    const userTicketCountRef = admin
      .firestore()
      .collection("userTickets")
      .doc(purchase.userId);

    // Run transaction to ensure atomicity
    await admin.firestore().runTransaction(async (transaction) => {
      // Read 'nextNumber' document
      const ticketNumberDoc = await transaction.get(ticketNumberRef);
      let currentNumber = ticketNumberDoc.exists
        ? ticketNumberDoc.data()?.number ?? 0
        : 0;

      const maxTicketNumber = 304;

      // Read user's ticket count document
      const userTicketCountDoc = await transaction.get(userTicketCountRef);
      let userTicketCount = userTicketCountDoc.exists
        ? userTicketCountDoc.data()?.ticketCount ?? 0
        : 0;

      // Check if the user has reached the maximum ticket limit
      const maxTicketsPerUser = 5;
      if (userTicketCount + numTickets > maxTicketsPerUser) {
        throw new Error("User has reached the maximum ticket limit.");
      }

      // Calculate new ticket numbers
      const newTicketNumbers = [];
      for (let i = 0; i < numTickets; i++) {
        currentNumber += 1;
        if (currentNumber > maxTicketNumber) {
          throw new Error("Maximum ticket number exceeded.");
        }
        newTicketNumbers.push(currentNumber);
      }

      // Update 'nextNumber' document
      transaction.set(
        ticketNumberRef,
        { number: currentNumber },
        { merge: true }
      );

      // Update user's ticket count
      userTicketCount += numTickets;
      transaction.set(
        userTicketCountRef,
        {
          userId: purchase.userId,
          email: purchase.userEmail,
          ticketCount: userTicketCount,
        },
        { merge: true }
      );

      // Create ticket documents
      const ticketsCollectionRef = admin.firestore().collection("tickets");

      // Generate tickets
      for (const ticketNumber of newTicketNumbers) {
        const ticket = {
          number: ticketNumber,
          purchaseId: purchase.id,
          userId: purchase.userId,
          userEmail: purchase.userEmail,
          imageUrl: "",
        };

        // Generate PDF ticket (outside transaction)
        const pdfBytes = await generateTicketPDF(ticket);

        // Upload PDF to storage and get URL (outside transaction)
        const imageUrl = await uploadTicketPDF(ticketNumber, pdfBytes);

        // Update ticket with imageUrl
        ticket.imageUrl = imageUrl;

        // Add ticket to Firestore
        const ticketDocRef = ticketsCollectionRef.doc();

        transaction.set(ticketDocRef, ticket);
      }
    });

    res.status(200).json({ message: "Tickets created." });
  } catch (error) {
    console.error("Error handling purchase:", error);
    res.status(500).json({ error: (error as Error).message });
  }
}

// Helper function to generate ticket PDF
async function generateTicketPDF(ticket: any): Promise<Uint8Array> {
  // Load the ticket template
  const templatePath = path.join(process.cwd(), "assets", "ticketTemplate.pdf");
  const templateBytes = await fs.promises.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Embed the fonts
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Get the first page
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  // Get the width and height
  const { width, height } = firstPage.getSize();

  // Add the ticket number
  firstPage.drawText(String(ticket.number), {
    x: width - 65,
    y: height - 65,
    size: 15,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });

  const emailWithoutDomain = ticket.userEmail.split("@")[0];

  firstPage.drawText(emailWithoutDomain, {
    x: width - 85,
    y: height - 90,
    size: 10,
    font: timesRomanFont,
    color: rgb(1, 0, 0),
  });

  // Serialize the PDFDocument to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();

  return pdfBytes;
}

// Helper function to upload ticket PDF to storage and get URL
async function uploadTicketPDF(
  ticketNumber: number,
  pdfBytes: Uint8Array
): Promise<string> {
  // Create a Google Cloud Storage client
  const bucket: Bucket = admin.storage().bucket();

  const hash = crypto.createHash("sha256");
  hash.update(String(ticketNumber));
  const shortTicketNumber = hash.digest("hex");

  // Define the destination
  const destination = `tickets/${shortTicketNumber}.pdf`;
  const file = bucket.file(destination);

  // Create a write stream for the new file in your bucket
  const stream = file.createWriteStream({
    metadata: {
      contentType: "application/pdf",
    },
  });

  // Write the pdfBytes to the file and end the write stream
  stream.write(pdfBytes);
  stream.end();

  return new Promise<string>((resolve, reject) => {
    stream.on("error", (err) => {
      console.error(err);
      reject(new Error("Error during upload."));
    });

    stream.on("finish", async () => {
      // The file upload is complete.
      await file.makePublic();

      const url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(
        destination
      )}`;
      resolve(url);
    });
  });
}
