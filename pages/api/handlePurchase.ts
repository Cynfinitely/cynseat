// pages/api/handlePurchase.ts
import { NextApiRequest, NextApiResponse } from "next";
import admin from "../../firebase/firebaseAdmin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import { Bucket } from "@google-cloud/storage";
import crypto from "crypto";

export default async function handlePurchase(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const purchase = req.body;
  const numTickets = purchase.numTickets; // Get the number of tickets from the purchase

  console.log("NUM OF :", numTickets);
  // Get the next ticket number
  const ticketNumberRef = admin.firestore().doc("tickets/nextNumber");

  // Use a transaction to increment the ticket number
  const ticketNumber = await admin
    .firestore()
    .runTransaction(async (transaction) => {
      const ticketNumberSnap = await transaction.get(ticketNumberRef);
      const currentNumber = ticketNumberSnap.data()?.number ?? 0; // Default to 0 if undefined
      const numTicketsToPurchase = numTickets ?? 0; // Default to 0 if undefined
      const nextNumber = currentNumber + numTicketsToPurchase;
      transaction.set(ticketNumberRef, { number: nextNumber }, { merge: true });
      return currentNumber + 1; // Return the first new ticket number
    });

  // Create a new ticket for each purchased ticket
  for (let i = 0; i < numTickets; i++) {
    const ticket = {
      number: ticketNumber + i, // Assign a unique number to each ticket
      purchaseId: purchase.id,
      userId: purchase.userId,
      userEmail: purchase.userEmail,
      imageUrl: "",
      // other ticket data...
    };

    // Load the ticket template
    const templateBytes = await fs.promises.readFile("ticketTemplate.pdf");
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
      y: height - 45,
      size: 25,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    const emailWithoutDomain = purchase.userEmail.split("@")[0];

    firstPage.drawText(emailWithoutDomain, {
      x: width - 85, // adjust as needed
      y: height - 90, // adjust as needed
      size: 10, // adjust as needed
      font: timesRomanFont,
      color: rgb(1, 0, 0),
    });

    // Serialize the PDFDocument to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save();

    // Create a Google Cloud Storage client
    const bucket: Bucket = admin.storage().bucket();

    const hash = crypto.createHash("sha256");
    hash.update(String(ticket.number));
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

    stream.on("error", (err) => {
      console.error(err);
      res.status(500).json({ error: "Error during upload." });
    });

    stream.on("finish", async () => {
      // The file upload is complete.
      await file.makePublic();

      const url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(
        destination
      )}`;

      // Add the URL to the ticket
      ticket.imageUrl = url;

      await admin.firestore().collection("tickets").add(ticket);
    });
  }
  res.status(200).json({ message: "Ticket created." });
}
