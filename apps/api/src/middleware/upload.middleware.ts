import multer from "multer";
import { env } from "../config/env.js";

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/csv",
  "text/x-csv",
];

export const uploadEmailFile = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    // Allow if mime type matches or file extension is .csv / .txt
    const isCsvOrTxt =
      file.originalname.toLowerCase().endsWith(".csv") ||
      file.originalname.toLowerCase().endsWith(".txt");
    if (allowedMimeTypes.includes(file.mimetype) || isCsvOrTxt) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only CSV and TXT files are supported."));
    }
  },
}).single("file");
