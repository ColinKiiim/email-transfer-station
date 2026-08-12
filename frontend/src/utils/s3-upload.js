export const putBlobToSignedUrl = async (url, blob, fetcher = fetch) => {
    const response = await fetcher(url, { method: 'PUT', body: blob })
    if (!response.ok) throw new Error(`S3 upload failed (${response.status})`)
}
