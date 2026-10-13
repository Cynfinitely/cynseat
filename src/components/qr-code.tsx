import QRCode from "qrcode";

/**
 * A QR code drawn as SVG rectangles on the server. Always dark on white with a quiet
 * zone, whatever the page theme, because scanners need the contrast.
 */
export function QrCode({
  value,
  label,
  size = 200,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const span = modules.size + quiet * 2;
  // One path for all dark modules keeps the markup small.
  let path = "";
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column)) path += `M${column + quiet} ${row + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
