import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'
import AWS from 'aws-sdk'
import uuid from 'uuid/v4'
import Jimp from 'jimp'

const { REGION, AVATARS_BUCKET } = process.env

AWS.config.update({
  region: REGION
})

const s3 = new AWS.S3()
const rekognition = new AWS.Rekognition()

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = uuid()
  const encodedImage = JSON.parse(event.body).image
  const decodedImage = Buffer.from(encodedImage, 'base64')

  const response: APIGatewayProxyResult = {
    statusCode: 200,
    body: ''
  }

  try {
    const uploaded = await s3
      .upload({
        Key: `${userId}/master.jpg`,
        Body: decodedImage,
        Bucket: AVATARS_BUCKET
      })
      .promise()

    const detected = await rekognition
      .detectFaces({
        Image: {
          S3Object: {
            Bucket: AVATARS_BUCKET,
            Name: uploaded.Key
          }
        }
      })
      .promise()

    const face = detected.FaceDetails[0]
    const image = await Jimp.read(decodedImage)

    const absoluteBox = {
      left: image.bitmap.width * face.BoundingBox.Left,
      right: image.bitmap.width * (face.BoundingBox.Left + face.BoundingBox.Width),
      top: image.bitmap.height * face.BoundingBox.Top,
      bottom: image.bitmap.height * (face.BoundingBox.Top + face.BoundingBox.Height)
    }

    // const halfWidth = (image.bitmap.width * face.BoundingBox.Width) / 2
    // const halfHeight = (image.bitmap.height * face.BoundingBox.Height) / 2
    // absoluteBox.left -= halfWidth
    // absoluteBox.right += halfWidth
    // absoluteBox.top -= halfHeight
    // absoluteBox.bottom += halfHeight

    console.log(`absoluteBox.left: ${absoluteBox.left}`)
    console.log(`absoluteBox.right: ${absoluteBox.right}`)
    console.log(`absoluteBox.top: ${absoluteBox.top}`)
    console.log(`absoluteBox.bottom: ${absoluteBox.bottom}`)

    const cropped = await image
      .crop(
        absoluteBox.left, // x
        absoluteBox.top, // y
        absoluteBox.right - absoluteBox.left, // w
        absoluteBox.bottom - absoluteBox.top // h
      )
      .cover(600, 600)
      .getBufferAsync(Jimp.MIME_JPEG)

    const data = await s3
      .upload({
        Key: `${userId}/small.jpg`,
        Body: cropped,
        Bucket: AVATARS_BUCKET
      })
      .promise()

    response.body = JSON.stringify(data)
  } catch (err) {
    console.error(err)

    response.statusCode = 500
    response.body = JSON.stringify(err)
  }

  return response
}
