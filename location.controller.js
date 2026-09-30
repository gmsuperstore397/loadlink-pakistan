const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');

// POST /api/location/reverse-geocode
// Proxies to OpenStreetMap Nominatim so the API key / rate limiting stays server-side.
// Frontend should prefer calling this over hitting Nominatim directly.
const reverseGeocode = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) throw new ApiError(400, 'latitude and longitude are required');

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


const geocode = asyncHandler(async (req, res) => {
  const address = String(req.body.address || '').trim();
  if (!address) throw new ApiError(400, 'address is required');
  if (address.length > 250) throw new ApiError(400, 'address is too long');

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', address);
    url.searchParams.set('countrycodes', 'pk');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'LoadLinkPakistan/1.0 (+https://loadlink-pakistan.onrender.com)',
        'Accept': 'application/json',
      },
    });
    if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
    const data = await resp.json();
    const first = Array.isArray(data) ? data[0] : null;

    if (!first) return success(res, 200, 'No location found', { location: null });

    return success(res, 200, 'Location resolved', {
      location: {
        lat: Number(first.lat),
        lng: Number(first.lon),
        displayName: first.display_name || address,
        raw: first,
      },
    });
  } catch (e) {
    return success(res, 200, 'Geocoding unavailable', { location: null });
  }
});

module.exports = { reverseGeocode, geocode };
