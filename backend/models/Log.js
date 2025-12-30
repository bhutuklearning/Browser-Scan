import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
    // Store the main system data as compressed binary
    payload: {
        type: Buffer,
        required: true
    },
    // Metadata kept uncompressed for easy searching/filtering
    ip: {
        type: String,
    },
    browser: {
        type: String,
    },
    isCompressed: {
        type: Boolean,
        default: true
    },
    receivedAt: {
        type: Date,
        default: Date.now()
    }
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);
export default Log;