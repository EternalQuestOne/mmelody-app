import crypto from 'crypto';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { public_id } = req.body;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!public_id || !cloudName || !apiKey || !apiSecret) {
     return res.status(400).json({ error: 'Missing Cloudinary configuration or public_id' });
  }

  // Cloudinary requires a timestamp in seconds
  const timestamp = Math.round(new Date().getTime() / 1000);

  // Securely generate the signature using your API Secret
  const signatureString = `public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

  // Package the data for Cloudinary
  const formData = new URLSearchParams();
  formData.append('public_id', public_id);
  formData.append('signature', signature);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);

  try {
    // Send the secure delete command to Cloudinary
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}