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
  const purchase = req.body;
  const numTickets = purchase.numTickets; // Get the number of tickets from the purchase

  // Get the next ticket number
  const ticketNumberRef = admin.firestore().doc("tickets/nextNumber");
  // Check if the user has reached the maximum ticket limit
  const userTicketsCount = await admin
    .firestore()
    .collection("tickets")
    .where("userEmail", "==", purchase.userEmail)
    .get()
    .then((snapshot) => snapshot.size);
  if (userTicketsCount + purchase.numTickets > 5) {
    // If the user is trying to purchase more than the maximum limit, return an error
    return res
      .status(400)
      .json({ message: "User has reached the maximum ticket limit." });
  }

  // Get the current ticket number
  const ticketNumberSnap = await ticketNumberRef.get();
  const currentNumber = ticketNumberSnap.data()?.number ?? 0; // Default to 0 if undefined
  const numTicketsToPurchase = numTickets ?? 0; // Default to 0 if undefined

  // Calculate the next ticket number
  const nextNumber = currentNumber + numTicketsToPurchase;

  // Use a batched write to increment the ticket number
  const batch = admin.firestore().batch();
  batch.set(ticketNumberRef, { number: nextNumber }, { merge: true });
  await batch.commit();

  // Use the first new ticket number
  const ticketNumber = currentNumber + 1;

  // Create a new ticket for each purchased ticket
  const ticketPromises = Array(numTickets)
    .fill(null)
    .map(async (_, i) => {
      const ticket = {
        number: ticketNumber + i, // Assign a unique number to each ticket
        purchaseId: purchase.id,
        userId: purchase.userId,
        userEmail: purchase.userEmail,
        imageUrl: "",
        // other ticket data...
      };

      // Load the ticket template
      const templatePath = path.join(
        process.cwd(),
        "assets",
        "ticketTemplate.pdf"
      );
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

      return new Promise<void>((resolve, reject) => {
        stream.on("error", (err) => {
          console.error(err);
          reject(new Error("Error during upload."));
        });

        stream.on("finish", async () => {
          // The file upload is complete.
          await file.makePublic();

          const url = `https://storage.googleapis.com/${
            bucket.name
          }/${encodeURI(destination)}`;

          // Add the URL to the ticket
          ticket.imageUrl = url;

          await admin.firestore().collection("tickets").add(ticket);
          resolve();
        });
      });
    });

  try {
    await Promise.all(ticketPromises);
    res.status(200).json({ message: "Ticket created." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
