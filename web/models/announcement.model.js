import mongoose from "mongoose";

const AnnouncementAuditSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  shop: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Avoid OverwriteModelError in case of hot-reloads in dev
const AnnouncementAudit = mongoose.models.AnnouncementAudit || mongoose.model("AnnouncementAudit", AnnouncementAuditSchema);

export default AnnouncementAudit;
