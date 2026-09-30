declare module "qrcode" {
  type QROptions = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  };

  const QRCode: {
    toDataURL(text: string, options?: QROptions): Promise<string>;
  };

  export default QRCode;
}
