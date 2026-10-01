const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');

const NOMINATIM_USER_AGENT = 'LoadLinkPakistan/1.0 (+https://loadlink-pakistan.onrender.com)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /api/location/reverse-geocode
const reverseGeocode = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw new ApiError(400, 'latitude and longitude are required');
  }

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1&accept-language=en`,
      { headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' } },
    );
    if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
    const data = await resp.json();
    const displayName = data.display_name || `${latitude}, ${longitude}`;
    return success(res, 200, 'Location resolved', { displayName, raw: data });
  } catch (e) {
    console.error('Reverse geocoding error:', e.message);
    return success(res, 200, 'Reverse geocoding unavailable, returning coordinates', {
      displayName: `${latitude}, ${longitude}`,
      raw: null,
    });
  }
});

const geocode = asyncHandler(async (req, res) => {
  const address = String(req.body.address || '').replace(/\s+/g, ' ').trim();
  if (!address) throw new ApiError(400, 'address is required');
  if (address.length > 250) throw new ApiError(400, 'address is too long');

  try {
    const search = async (query) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('countrycodes', 'pk');
      url.searchParams.set('limit', '3');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');

      const resp = await fetch(url, {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
          Accept: 'application/json',
        },
      });
      if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
      return resp.json();
    };

    // Put Pakistan into the free-form query. This improves matching for
    // local addresses while countrycodes=pk keeps the result inside Pakistan.
    const primaryQuery = /\bpakistan\b/i.test(address) ? address : `${address}, Pakistan`;
    let data = await search(primaryQuery);
    let first = Array.isArray(data) ? data[0] : null;

    // Only make one fallback request, and respect Nominatim's public-service
    // request spacing so the fallback is not immediately rate-limited.
    if (!first) {
      await sleep(1100);
      data = await search(address);
      first = Array.isArray(data) ? data[0] : null;
    }

    if (!first) {
      return success(res, 200, 'No location found', {
        location: null,
        message: 'Address OSM map database mein nahi mila.',
      });
    }

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
    return success(res, 200, 'Geocoding unavailable', {
      location: null,
      message: 'Location search service temporarily unavailable.',
    });
  }
});

module.exports = { reverseGeocode, geocode };
