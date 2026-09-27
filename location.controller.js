const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');

// POST /api/location/reverse-geocode
// Proxies to OpenStreetMap Nominatim so the API key / rate limiting stays server-side.
// Frontend should prefer calling this over hitting Nominatim directly.
const reverseGeocode = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) throw new ApiError(400, 'latitude and longitude are required');

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': 'LoadLinkPakistan/1.0' } },
    );
    const data = await resp.json();
    const displayName = data.display_name || `${latitude}, ${longitude}`;
    return success(res, 200, 'Location resolved', { displayName, raw: data });
  } catch (e) {
    return success(res, 200, 'Reverse geocoding unavailable, returning coordinates', {
      displayName: `${latitude}, ${longitude}`,
      raw: null,
    });
  }
});

module.exports = { reverseGeocode };
