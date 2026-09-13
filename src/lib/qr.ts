import "server-only";
import qrcode from "qrcode-generator";

/**
 * A QR code as inline SVG, for the authenticator-app enrolment screen.
 * Rendered on the server so the secret never rides through a third-party
 * image service; scalable so it is crisp at any size.
 */
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
