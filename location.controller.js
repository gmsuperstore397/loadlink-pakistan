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
    const search = async (query, structured = null) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '5');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');

      if (structured) {
        Object.entries(structured).forEach(([key, value]) => {
          if (value) url.searchParams.set(key, String(value));
        });
      } else {
        url.searchParams.set('q', query);
      }

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

    const queries = [];
    const add = (q) => {
      const value = String(q || '').replace(/\s+/g, ' ').trim().replace(/,+/g, ',');
      if (value && !queries.includes(value)) queries.push(value);
    };

    // First try exactly what the user typed. Nominatim supports free-form
    // addresses and different component orders.
    add(normalized);

    const withoutPakistan = normalized.replace(/,?\s*Pakistan\s*$/i, '').trim();
    add(withoutPakistan);
    add(`${withoutPakistan}, Pakistan`);

    // Build useful variants for detailed real-world addresses where landmarks
    // such as "near", "next to", "opposite" are not themselves mapped POIs.
    let base = withoutPakistan;
    base = base
      .replace(/\b(next\s+to|near|opposite|behind|beside|in\s+front\s+of|close\s+to)\b[^,]*/gi, '')
      .replace(/\s*,\s*,+/g, ',')
      .replace(/^\s*,|,\s*$/g, '')
      .trim();
    add(base);
    add(`${base}, Pakistan`);

    // Try removing a business/shop name at the beginning while retaining
    // the street, locality and city.
    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      add(parts.slice(1).join(', '));
      add(`${parts.slice(1).join(', ')}, Pakistan`);
    }

    // If the address contains a city, also try a compact street/locality/city
    // query. This is especially useful for Pakistani addresses with many
    // landmarks that are not present in OSM.
    const cities = [
      'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
      'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Gujranwala',
      'Sialkot', 'Bahawalpur', 'Sukkur', 'Abbottabad', 'Murree',
      'Gujrat', 'Sargodha', 'Mardan', 'Kasur', 'Okara', 'Jhelum',
      'Sheikhupura', 'Rahim Yar Khan', 'Larkana', 'Nawabshah'
    ];
    const foundCity = cities.find((city) => new RegExp('\\b' + city.replace(/\s+/g, '\\s+') + '\\b', 'i').test(normalized));

    if (foundCity) {
      const cityRegex = new RegExp('(?:,?\\s*)' + foundCity.replace(/\s+/g, '\\s+') + '(?:,?\\s*Pakistan)?\\s*$', 'i');
      const beforeCity = withoutPakistan.replace(cityRegex, '').trim().replace(/,+$/g, '').trim();
      add(`${beforeCity}, ${foundCity}`);
      add(`${beforeCity}, ${foundCity}, Pakistan`);
      add(`${foundCity}, ${beforeCity}, Pakistan`);

      // Structured query is a second-stage fallback. Nominatim supports
      // street/city/state/country independently from free-form q.
      const stateByCity = {
        Karachi: 'Sindh',
        Lahore: 'Punjab',
        Islamabad: 'Islamabad Capital Territory',
        Rawalpindi: 'Punjab',
        Faisalabad: 'Punjab',
        Multan: 'Punjab',
        Peshawar: 'Khyber Pakhtunkhwa',
        Quetta: 'Balochistan',
        Hyderabad: 'Sindh',
        Gujranwala: 'Punjab',
        Sialkot: 'Punjab',
        Bahawalpur: 'Punjab',
        Sukkur: 'Sindh',
        Abbottabad: 'Khyber Pakhtunkhwa',
        Murree: 'Punjab',
        Gujrat: 'Punjab',
        Sargodha: 'Punjab',
        Mardan: 'Khyber Pakhtunkhwa',
        Kasur: 'Punjab',
        Okara: 'Punjab',
        Jhelum: 'Punjab',
        Sheikhupura: 'Punjab',
        'Rahim Yar Khan': 'Punjab',
        Larkana: 'Sindh',
        Nawabshah: 'Sindh',
      };

      const streetPart = parts
        .filter((part) => !new RegExp('^' + foundCity.replace(/\s+/g, '\\s+') + '$', 'i').test(part))
        .filter((part) => !/^(pakistan)$/i.test(part))
        .filter((part) => !/^(near|next\s+to|opposite|behind|beside)$/i.test(part))
        .slice(0, 2)
        .join(', ');

      if (streetPart) {
        const street = streetPart.split(',')[0].trim();
        const structured = {
          street,
          city: foundCity,
          state: stateByCity[foundCity],
          country: 'Pakistan',
        };
        const structuredResults = await search('', structured);
        if (Array.isArray(structuredResults) && structuredResults.length) {
          const first = structuredResults[0];
          const lat = Number(first.lat);
          const lng = Number(first.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return success(res, 200, 'Location resolved', {
              location: {
                lat,
                lng,
                displayName: first.display_name || address,
                raw: first,
                approximate: true,
              },
            });
          }
        }
      }
    }

    let first = null;
    for (let i = 0; i < queries.length; i += 1) {
      const data = await search(queries[i]);
      if (Array.isArray(data) && data.length) {
        first = data[0];
        break;
      }
      if (i < queries.length - 1) await sleep(1100);
    }

    if (!first) {
      return success(res, 200, 'No location found', {
        location: null,
        message: 'Address map database mein nahi mila. Map par pin manually set karein.',
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
        approximate: false,
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
