import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client} from '@aws-sdk/client-s3'
import { randomUUID} from 'crypto'
import { getTicketFileExtension } from './ticketFileTypes.js';
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const bucket  = process.env.AWS_S3_BUCKET


export const postImage = async(file)=>{
  const extension = getTicketFileExtension(file.mimetype);
  if (!extension) {
    throw new Error('Unsupported ticket file type');
  }
  const key  = `images/${randomUUID()}${extension}`
  const result = await s3.send(new PutObjectCommand({
    Key: key,
    Bucket: bucket,
    Body: file.buffer,
    ContentType: file.mimetype
  }))
  return key
}

export const getImage = async(key)=>{
  return s3.send(new GetObjectCommand({
    Key: key,
    Bucket: bucket
  }))
}

export const deleteImage = async(key)=>{
    const deleteResult = await s3.send(new DeleteObjectCommand({
        Key: key,
        Bucket: bucket
    }))
    return deleteResult
}
