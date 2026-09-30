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
    const search = async (query, restrictPakistan = true) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      if (restrictPakistan) url.searchParams.set('countrycodes', 'pk');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'LoadLinkPakistan/1.0 (+https://loadlink-pakistan.onrender.com)',
          'Accept': 'application/json',
        },
      });
      if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
      return resp.json();
    };

    // First try Pakistan-only. If OSM has not indexed the exact wording,
    // retry once with "Pakistan" in the free-form query.
    let data = await search(address, true);
    let first = Array.isArray(data) ? data[0] : null;
    if (!first) {
      data = await search(address.toLowerCase().includes('pakistan') ? address : address + ', Pakistan', false);
      first = Array.isArray(data) ? data[0] : null;
    }

    if (!first) return success(res, 200, 'No location found', { location: null });

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return success(res, 200, 'No valid location found', { location: null });
    }

    return success(res, 200, 'Location resolved', {
      location: {
        lat,
        lng,
        displayName: first.display_name || address,
        raw: first,
      },
    });
  } catch (e) {
    console.error('Geocoding error:', e.message);
    return success(res, 200, 'Geocoding unavailable', { location: null });
  }
});
module.exports = { reverseGeocode, geocode };
