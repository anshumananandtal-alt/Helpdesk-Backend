
import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const MONGODB_URI =
            `mongodb+srv://${process.env.MONGO_USERNAME}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@node.3l7dvs8.mongodb.net/${process.env.DEFAULT_DATABASE}`;

        console.log("Connecting to MongoDB...");

        await mongoose.connect(MONGODB_URI);

        console.log("Connected to MongoDB successfully!");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error.message);
        process.exit(1);
    }
};

export default connectDB;
