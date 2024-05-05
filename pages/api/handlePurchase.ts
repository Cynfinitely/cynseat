// pages/api/handlePurchase.ts
import { NextApiRequest, NextApiResponse } from "next";
import admin from "../../firebase/firebaseAdmin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { Bucket } from "@google-cloud/storage";

export default async function handlePurchase(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const purchase = req.body;

  // Get the next ticket number
  const ticketNumberRef = admin.firestore().doc("tickets/nextNumber");

  // Use a transaction to increment the ticket number
  const ticketNumber = await admin
    .firestore()
    .runTransaction(async (transaction) => {
      const ticketNumberSnap = await transaction.get(ticketNumberRef);
      const nextNumber = ticketNumberSnap.exists
        ? ticketNumberSnap.data()?.number + 1 ?? 1
        : 1;
      transaction.set(ticketNumberRef, { number: nextNumber }, { merge: true });
      return nextNumber;
    });

  // Create a new ticket
  const ticket = {
    number: ticketNumber,
    purchaseId: purchase.id,
    userId: purchase.userId,
    imageUrl: "",
    // other ticket data...
  };

  await admin.firestore().collection("tickets").add(ticket);

  // Load the ticket template
  const templateBytes = fs.readFileSync("ticketTemplate.pdf");
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Embed the fonts
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Get the first page
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  // Get the width and height
  const { width, height } = firstPage.getSize();

  // Add the ticket number
  firstPage.drawText(String(ticketNumber), {
    x: width / 2,
    y: height / 2,
    size: 50,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });

  // Serialize the PDFDocument to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();

  // This is a Buffer that can be written to a file
  const pdfPath = `ticket_${uuidv4()}.pdf`;
  fs.writeFileSync(pdfPath, pdfBytes);

  // Create a Google Cloud Storage client
  const bucket: Bucket = admin.storage().bucket();

  // Upload the PDF to Firebase Storage
  const destination = `tickets/${ticketNumber}.pdf`;
  await bucket.upload(pdfPath, {
    destination: destination,
  });

  // Generate a public URL for the uploaded PDF
  const file = bucket.file(destination);
  await file.makePublic();

  const url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(
    destination
  )}`;

  // Add the URL to the ticket
  ticket.imageUrl = url;

  await admin.firestore().collection("tickets").add(ticket);

  res.status(200).json({ message: "Ticket created." });
}
