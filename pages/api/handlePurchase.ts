// pages/api/handlePurchase.ts

import { NextApiRequest, NextApiResponse } from "next";
import admin from "../../firebase/firebaseAdmin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import { Bucket } from "@google-cloud/storage";
import crypto from "crypto";
import path from "path";

// Import the seatCodes array
const seatRows = ["A", "B", "C", "D", "E", "F", "G"];
const seatsPerRow = 22;
const seatCodes = seatRows.flatMap((row) =>
  Array.from({ length: seatsPerRow }, (_, i) => `${row}${i + 1}`)
);

export default async function handlePurchase(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const purchase = req.body;
    const numTickets = purchase.numTickets;

    // Firestore doc to keep track of the next seat index
    const seatIndexRef = admin.firestore().doc("tickets/seatIndex");

    // Check if user is over limit (5 tickets)
    const userTicketsCount = await admin
      .firestore()
      .collection("tickets")
      .where("userEmail", "==", purchase.userEmail)
      .get()
      .then((snapshot) => snapshot.size);

    if (userTicketsCount + numTickets > 5) {
      return res.status(400).json({
        message: "User has reached the maximum ticket limit (5).",
      });
    }

    // Transaction to reserve seats
    const startingIndex = await admin
      .firestore()
      .runTransaction(async (transaction) => {
        const seatIndexSnap = await transaction.get(seatIndexRef);
        const currentIndex = seatIndexSnap.data()?.index ?? 0;
        const nextIndex = currentIndex + numTickets;

        // Ensure we don't exceed total seats
        if (nextIndex > seatCodes.length) {
          throw new Error("Not enough seats available.");
        }

        transaction.set(seatIndexRef, { index: nextIndex }, { merge: true });

        // Return the old index (the first seat for the new purchase)
        return currentIndex;
      });

    // Now generate and upload PDFs for each seat
    const ticketPromises = Array.from({ length: numTickets }, async (_, i) => {
      const seatIndex = startingIndex + i;
      const seatCode = seatCodes[seatIndex];

      // Build ticket record
      const ticketData = {
        seatCode,
        purchaseId: purchase.id,
        userId: purchase.userId,
        userEmail: purchase.userEmail,
        imageUrl: "",
      };

      // Load PDF Template
      const templatePath = path.join(
        process.cwd(),
        "assets",
        "ticketTemplate.pdf"
      );
      const templateBytes = await fs.promises.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);

      // Write seatCode onto PDF
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const [page] = pdfDoc.getPages();
      const { width, height } = page.getSize();

      page.drawText(seatCode, {
        x: width - 100,
        y: height - 65,
        size: 50,
        font,
        color: rgb(1, 0, 0),
      });

      const emailPrefix = purchase.userEmail.split("@")[0];
      page.drawText(emailPrefix, {
        x: width - 100,
        y: height - 85,
        size: 12,
        font,
        color: rgb(1, 0, 0),
      });

      // Save PDF to bytes
      const pdfBytes = await pdfDoc.save();

      // Upload PDF to GCS
      const bucket: Bucket = admin.storage().bucket();
      const hash = crypto.createHash("sha256").update(seatCode).digest("hex");
      const filePath = `tickets/${hash}.pdf`;
      const file = bucket.file(filePath);

      const stream = file.createWriteStream({
        metadata: { contentType: "application/pdf" },
      });
      stream.write(pdfBytes);
      stream.end();

      return new Promise<void>((resolve, reject) => {
        stream.on("error", (err) => reject(err));
        stream.on("finish", async () => {
          await file.makePublic();
          ticketData.imageUrl = `https://storage.googleapis.com/${
            bucket.name
          }/${encodeURI(filePath)}`;
          // Write ticket document
          await admin.firestore().collection("tickets").add(ticketData);
          resolve();
        });
      });
    });

    await Promise.all(ticketPromises);
    return res.status(200).json({ message: "Tickets purchased successfully." });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
