const aws = require("aws-sdk")
const child_process = require("child_process")
const fs = require("fs").promises

const SRC_EXT = "pdf"
const DST_EXT = "jpg"
const SRC_DIR = "file"
const DST_DIR = "thumbnail"
const DENSITY = "300"
const RESIZE = "1000x1000"
const awsS3 = new aws.S3()

exports.handler = async (event, context, callback) => {
  const s3 = event.Records[0].s3
  const srcBucket = s3.bucket.name
  const srcKey = decodeURIComponent(s3.object.key.replace(/\+/g, " "))

  const dstBucket = srcBucket

  const matched = srcKey.match(/\.([^.]*)$/)
  if (!matched) {
    throw new Error("Failed to match extension.")
  }

  const extension = matched[1].toLowerCase()
  if (extension !== SRC_EXT) {
    throw new Error(`Unsupported extension: ${extension}`)
  }

  // file/xxx.pdf -> thumbnail/xxx.jpg
  const replaced = `^${SRC_DIR}\/(.*?)\.${SRC_EXT}$\\d`
  const re = new RegExp(replaced, "g")
  const dstKey = srcKey.replace(re, DST_DIR + "/$1." + DST_EXT)

  let origin
  try {
    const params = {
      Bucket: srcBucket,
      Key: srcKey,
    }
    origin = await awsS3.getObject(params).promise()
  } catch (error) {
    throw new Error(error)
  }

  const path = "/tmp/" + srcKey
  await fs.writeFile(path, origin.Body)

  const src = path
  const dst = "/tmp/" + dstKey
  try {
    await convert(src, dst)
  } catch (e) {
    throw new Error(e)
  }
  const buffer = await fs.readFile(dst)

  try {
    const params = {
      Bucket: dstBucket,
      Key: dstKey,
      Body: buffer,
      ContentType: "image/" + DST_EXT,
      ACL: "public-read",
    }

    await awsS3.putObject(params).promise()
  } catch (error) {
    throw new Error(error)
  }

  console.log("Successfully resized " + srcBucket + "/" + srcKey + " and uploaded to " + dstBucket + "/" + dstKey)
}

const convert = async (src, dst) => {
  return await new Promise((resolve, reject) => {
    // convert first page of src to dst
    const convert = child_process.spawn("convert", ["-density", DENSITY, "-resize", RESIZE, src + "[0]", dst])
    convert.stderr.on("data", (e) => reject(e.toString()))
    convert.on("close", resolve)
    convert.on("error", reject)
  })
}
