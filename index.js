// This is not needed to be included in node_modules because it is in default lambda runtime.
const aws = require("aws-sdk")

const child_process = require("child_process")
const got = require("got")
const fs = require("fs").promises

const SRC_EXTENSION = "pdf"
const DST_KEY_PREFIX = "thumbnail"
const DST_EXTENSION = "jpg"

const awsS3 = new aws.S3()

exports.handler = async (event, context, callback) => {
  console.log("event: ", event)

  let srcPath
  let data
  let dstKey
  let dstPath

  // When passed external resource url, such as Firebase Storage.
  if (event.url && event.fileId) {
    srcPath = "/tmp/" + event.fileId + "." + SRC_EXTENSION
    dstPath = "/tmp/" + event.fileId + "." + DST_EXTENSION
    dstKey = DST_KEY_PREFIX + "/" + event.fileId

    const response = await got(event.url)
    console.log("fetched from url: ", event.url)
    data = response.rawBody
  }
  // When fired by s3 object created trigger.
  else {
    const bucket = event.Records[0].s3.bucket.name
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "))
    srcPath = "/tmp/" + filenameOf(srcKey)

    // file/xxx.<SRC_EXTENSION> -> <DST_KEY_PREFIX>/xxx.<DST_EXTENSION>
    const re = new RegExp(`^file\/(.*?)\.${SRC_EXTENSION}$`, "g")
    dstKey = srcKey.replace(re, DST_KEY_PREFIX + "/$1." + DST_EXTENSION)
    dstPath = "/tmp/" + filenameOf(dstKey)

    const getParams = {
      Bucket: bucket,
      Key: srcKey,
    }
    const origin = await awsS3.getObject(getParams).promise()
    console.log("fetched from s3:", getParams)
    data = origin.Body
  }

  console.log("srcPath: ", srcPath)
  console.log("dstPath: ", dstPath)
  await fs.writeFile(srcPath, data)

  await convert(srcPath, dstPath)
  const buffer = await fs.readFile(dstPath)

  const putParams = {
    Bucket: process.env.BUCKET,
    Key: dstKey,
    Body: buffer,
    ContentType: "image/" + DST_EXTENSION,
    ACL: "public-read",
  }
  const result = await awsS3.upload(putParams).promise()
  console.log("put to s3:", result.Location)
}

const DENSITY = "300"
const RESIZE = "1000x1000"

// convert pdf to <DST_EXTENSION>
const convert = async (src, dst) => {
  return await new Promise((resolve, reject) => {
    // convert first page of src to dst
    const convert = child_process.spawn("convert", ["-density", DENSITY, "-resize", RESIZE, src + "[0]", dst])
    convert.stderr.on("data", (e) => reject(e.toString()))
    convert.on("close", resolve)
    convert.on("error", reject)
  })
}

const filenameOf = (path) => {
  const matched = path.match(/\/([^/]*)$/)
  if (!matched) {
    throw new Error(`path: ${path} was not matched to filename RegExp.`)
  }

  return matched[1]
}
