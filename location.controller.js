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
    const search = async (query, extra = {}) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('q', query);
      url.searchParams.set('countrycodes', 'pk');
      url.searchParams.set('limit', '5');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');
      Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, String(value)));

      const resp = await fetch(url, {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
          Accept: 'application/json',
        },
      });
      if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
      return resp.json();
    };

    const normalized = address
      .replace(/[，、]/g, ',')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try several equivalent forms because detailed Pakistani addresses are
    // often written in a different order than the OSM address index.
    const queries = [];
    const add = (q) => {
      const value = String(q || '').trim();
      if (value && !queries.includes(value)) queries.push(value);
    };

    add(normalized);
    add(/\bpakistan\b/i.test(normalized) ? normalized : normalized + ', Pakistan');

    // If the address contains a common Karachi/Lahore/Islamabad city name,
    // put the city at the end as Nominatim's free-form parser handles
    // comma-separated city context better.
    const cities = [
      'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
      'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Gujranwala',
      'Sialkot', 'Bahawalpur', 'Sukkur', 'Abbottabad'
    ];
    const foundCity = cities.find((city) => new RegExp('\\b' + city + '\\b', 'i').test(normalized));
    if (foundCity) {
      const withoutCity = normalized
        .replace(new RegExp('(?:,?\\s*)' + foundCity + '(?:,?\\s*Pakistan)?\\s*$', 'i'), '')
        .trim()
        .replace(/,+$/g, '')
        .trim();
      add(withoutCity + ', ' + foundCity + ', Pakistan');
      add(foundCity + ', ' + withoutCity + ', Pakistan');
    }

    // Remove Pakistan for one final spelling/order attempt while keeping the
    // Pakistan hard filter active.
    add(normalized.replace(/,?\s*Pakistan\s*$/i, '').trim());

    let first = null;
    for (let i = 0; i < queries.length && i < 4; i += 1) {
      const data = await search(queries[i], {
        layer: 'address,poi',
      });
      if (Array.isArray(data) && data.length) {
        first = data[0];
        break;
      }
      if (i < 3) await sleep(1100);
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
