// pages/api/handlePurchase.ts

import { NextApiRequest, NextApiResponse } from "next";
import admin from "../../firebase/firebaseAdmin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Bucket } from "@google-cloud/storage";
import crypto from "crypto";

// Maximum tickets allowed for this event
const MAX_TICKETS = 300;

// Generate seat codes for 300 tickets
const seatCodes = Array.from({ length: MAX_TICKETS }, (_, i) => `SEAT-${String(i + 1).padStart(3, '0')}`);

export default async function handlePurchase(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("=== Purchase Request Received ===");
  console.log("Request body:", req.body);
  
  try {
    const purchase = req.body;
    const numTickets = purchase.numTickets;

    console.log(`Processing purchase for ${numTickets} ticket(s)`);

    // Validate number of tickets
    if (!numTickets || numTickets < 1 || numTickets > 10) {
      return res.status(400).json({ error: "Invalid number of tickets. Must be between 1 and 10." });
    }

    // Firestore doc to keep track of the next seat index
    const seatIndexRef = admin.firestore().doc("tickets/seatIndex");

    // Transaction to reserve seats atomically (prevents race conditions)
    const startingIndex = await admin
      .firestore()
      .runTransaction(async (transaction) => {
        const seatIndexSnap = await transaction.get(seatIndexRef);
        const currentIndex = seatIndexSnap.data()?.index ?? 0;
        const nextIndex = currentIndex + numTickets;

        // Check if we have enough tickets available
        if (currentIndex >= MAX_TICKETS) {
          throw new Error("All tickets have been sold out.");
        }

        // Check if this purchase would exceed the limit
        if (nextIndex > MAX_TICKETS) {
          const remaining = MAX_TICKETS - currentIndex;
          throw new Error(`Only ${remaining} ticket(s) remaining. Cannot purchase ${numTickets} tickets.`);
        }

        // Update the index atomically
        transaction.set(seatIndexRef, { index: nextIndex }, { merge: true });

        // Return the starting index for this purchase
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

      // Create a new PDF document (A4 size: 595x842 points)
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      const { width, height } = page.getSize();

      // Embed fonts
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Colors
      const primaryColor = rgb(0.58, 0.29, 0.89); // Purple
      const secondaryColor = rgb(0.2, 0.4, 0.8); // Blue
      const textColor = rgb(0.2, 0.2, 0.2); // Dark gray
      const lightGray = rgb(0.9, 0.9, 0.9);

      // Draw header background
      page.drawRectangle({
        x: 0,
        y: height - 150,
        width: width,
        height: 150,
        color: primaryColor,
      });

      // Draw gradient effect (lighter rectangle)
      page.drawRectangle({
        x: 0,
        y: height - 150,
        width: width,
        height: 50,
        color: rgb(0.68, 0.49, 0.95),
        opacity: 0.5,
      });

      // Event Title
      page.drawText('Bir Masal Gibi Anlat', {
        x: 50,
        y: height - 80,
        size: 32,
        font: boldFont,
        color: rgb(1, 1, 1),
      });

      // "Event Ticket" label
      page.drawText('ETKINLIK BILETI', {
        x: 50,
        y: height - 110,
        size: 14,
        font: regularFont,
        color: rgb(1, 1, 1),
        opacity: 0.9,
      });

      // Ticket number box (top right)
      page.drawRectangle({
        x: width - 180,
        y: height - 120,
        width: 160,
        height: 60,
        color: rgb(1, 1, 1),
        borderColor: primaryColor,
        borderWidth: 2,
      });

      page.drawText('BILET NO:', {
        x: width - 170,
        y: height - 75,
        size: 10,
        font: regularFont,
        color: textColor,
      });

      page.drawText(seatCode, {
        x: width - 170,
        y: height - 100,
        size: 20,
        font: boldFont,
        color: primaryColor,
      });

      // Event details section
      let currentY = height - 200;
      const leftMargin = 50;
      const lineHeight = 35;

      // Helper function to draw a detail line
      const drawDetailLine = (label: string, value: string, yPos: number) => {
        page.drawText(label, {
          x: leftMargin,
          y: yPos,
          size: 11,
          font: boldFont,
          color: secondaryColor,
        });
        page.drawText(value, {
          x: leftMargin + 150,
          y: yPos,
          size: 11,
          font: regularFont,
          color: textColor,
        });
      };

      // Draw divider line
      page.drawLine({
        start: { x: 50, y: currentY + 10 },
        end: { x: width - 50, y: currentY + 10 },
        thickness: 1,
        color: lightGray,
      });

      currentY -= 40;

      // Event details
      drawDetailLine('Tarih:', '10 Ocak Cumartesi', currentY);
      currentY -= lineHeight;

      drawDetailLine('Saat:', '18:30', currentY);
      currentY -= lineHeight;

      drawDetailLine('Yer:', 'Martinlaakson Auditorio', currentY);
      currentY -= lineHeight;

      drawDetailLine('Yaş Sınırı:', '10 yaş ve üzeri', currentY);
      currentY -= lineHeight;

      // Draw divider line
      page.drawLine({
        start: { x: 50, y: currentY - 5 },
        end: { x: width - 50, y: currentY - 5 },
        thickness: 1,
        color: lightGray,
      });

      currentY -= 40;

      // Artist and performance details
      drawDetailLine('Sanatçı:', 'Metin Haboğlu', currentY);
      currentY -= lineHeight;

      drawDetailLine('Süre:', '100 dakika', currentY);
      currentY -= lineHeight;

      // Concept (wrapped text)
      page.drawText('Konsept:', {
        x: leftMargin,
        y: currentY,
        size: 11,
        font: boldFont,
        color: secondaryColor,
      });
      page.drawText('Müzik ve Söyleşi /', {
        x: leftMargin + 150,
        y: currentY,
        size: 11,
        font: regularFont,
        color: textColor,
      });
      currentY -= 20;
      page.drawText('Tek kişilik sahne performansı', {
        x: leftMargin + 150,
        y: currentY,
        size: 11,
        font: regularFont,
        color: textColor,
      });

      currentY -= 60;

      // Draw divider line
      page.drawLine({
        start: { x: 50, y: currentY },
        end: { x: width - 50, y: currentY },
        thickness: 1,
        color: lightGray,
      });

      currentY -= 40;

      // Buyer information
      page.drawText('Satın Alan:', {
        x: leftMargin,
        y: currentY,
        size: 11,
        font: boldFont,
        color: secondaryColor,
      });

      const emailPrefix = purchase.userEmail.split("@")[0];
      page.drawText(emailPrefix, {
        x: leftMargin + 150,
        y: currentY,
        size: 11,
        font: regularFont,
        color: textColor,
      });

      // Footer section
      const footerY = 100;
      
      // Draw footer background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: footerY,
        color: rgb(0.95, 0.95, 0.95),
      });

      // Footer text
      page.drawText('CynSeat - Etkinlik Bilet Sistemi', {
        x: 50,
        y: 60,
        size: 10,
        font: boldFont,
        color: textColor,
      });

      page.drawText('Bu bilet geçerli bir satın alma işlemini temsil eder.', {
        x: 50,
        y: 40,
        size: 8,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText('Lütfen etkinliğe gelirken bu bileti yanınızda bulundurun.', {
        x: 50,
        y: 25,
        size: 8,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      // QR Code placeholder (decorative box)
      page.drawRectangle({
        x: width - 120,
        y: 20,
        width: 70,
        height: 70,
        color: rgb(1, 1, 1),
        borderColor: lightGray,
        borderWidth: 1,
      });

      page.drawText('QR', {
        x: width - 100,
        y: 48,
        size: 16,
        font: boldFont,
        color: lightGray,
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
        stream.on("error", (err) => {
          console.error("Error uploading PDF to Storage:", err);
          reject(err);
        });
        stream.on("finish", async () => {
          try {
            console.log(`Making file public: ${filePath}`);
            await file.makePublic();
            
            ticketData.imageUrl = `https://storage.googleapis.com/${
              bucket.name
            }/${encodeURI(filePath)}`;
            
            console.log(`Creating Firestore document for: ${seatCode}`);
            // Write ticket document to Firestore
            const docRef = await admin.firestore().collection("tickets").add(ticketData);
            console.log(`Ticket document created with ID: ${docRef.id}`);
            
            resolve();
          } catch (error) {
            console.error("Error in finish handler:", error);
            reject(error);
          }
        });
      });
    });

    await Promise.all(ticketPromises);
    return res.status(200).json({ message: "Tickets purchased successfully." });
  } catch (error) {
    console.error("Error in handlePurchase:", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
