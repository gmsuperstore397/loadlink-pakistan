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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': NOMINATIM_USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error('Nominatim HTTP ' + resp.status);
        return resp.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    const normalized = address
      .replace(/[，、]/g, ',')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();

    // Common romanized spellings seen in Pakistani addresses.
    const spellingVariants = (value) => {
      const variants = new Set([value]);
      const replacements = [
        [/\bmaripure\b/gi, 'maripur'],
        [/\bmauripur\b/gi, 'maripur'],
        [/\bmari\s*pur\b/gi, 'maripur'],
        [/\bmaripur\b/gi, 'mauripur'],
      ];
      for (const [pattern, replacement] of replacements) {
        for (const item of [...variants]) variants.add(item.replace(pattern, replacement));
      }
      return [...variants];
    };

    const queries = [];
    const add = (q) => {
      const value = String(q || '').replace(/\s+/g, ' ').trim().replace(/,+/g, ',');
      if (value && !queries.includes(value)) queries.push(value);
    };

    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    const withoutCountry = normalized
      .replace(/,?\s*(Pakistan|India|UAE|United Arab Emirates|Saudi Arabia|United Kingdom|UK|USA|United States)\s*$/i, '')
      .trim();

    // Identify the city/country from the end where possible, without forcing
    // a Pakistan-only city list. The last component is commonly the city.
    const countryMatch = normalized.match(/(?:,\s*|\s+)(Pakistan|India|UAE|United Arab Emirates|Saudi Arabia|United Kingdom|UK|USA|United States)\s*$/i);
    const country = countryMatch ? countryMatch[1] : '';
    const coreParts = withoutCountry.split(',').map((p) => p.trim()).filter(Boolean);
    const city = coreParts.length >= 2 ? coreParts[coreParts.length - 1] : '';

    const relational = /\b(next\s+to|near|opposite|behind|beside|in\s+front\s+of|close\s+to|adjacent\s+to)\b/i;
    const streetPattern = /\b(road|rd|street|st|avenue|ave|boulevard|blvd|highway|hwy|drive|dr|lane|ln|way|roadside|main\s+road|link\s+road)\b/i;

    let poiName = '';
    let street = '';
    let localityParts = [];

    if (coreParts.length) {
      // First segment is treated as a POI only when a later segment clearly
      // looks like a street/address. This prevents "Kashif Transport" from
      // becoming the street in a structured query.
      const streetIndex = coreParts.findIndex((p) => streetPattern.test(p));
      if (streetIndex > 0) poiName = coreParts[0];
      if (streetIndex >= 0) street = coreParts[streetIndex];
      if (!street && coreParts.length >= 2) street = coreParts[0];

      localityParts = coreParts.slice(0, -1).filter((p) =>
        p !== poiName && p !== street && !relational.test(p)
      );

      // Remove landmark-only phrases while keeping the actual locality.
      localityParts = localityParts
        .flatMap((p) => p.split(/\b(?:next\s+to|near|opposite|behind|beside|in\s+front\s+of|close\s+to|adjacent\s+to)\b/i))
        .map((p) => p.trim())
        .filter(Boolean);
    }

    const locality = localityParts.slice(-2).join(', ');

    // Build several focused free-form queries. Nominatim processes free-form
    // searches left-to-right/right-to-left, and commas improve performance.
    for (const variant of spellingVariants(normalized)) add(variant);
    for (const variant of spellingVariants(withoutCountry)) add(variant);
    if (street && city) {
      for (const s of spellingVariants(street)) {
        add(`${s}, ${city}${country ? `, ${country}` : ''}`);
        if (locality) add(`${s}, ${locality}, ${city}${country ? `, ${country}` : ''}`);
      }
    }
    if (locality && city) add(`${locality}, ${city}${country ? `, ${country}` : ''}`);
    if (poiName && city) add(`${poiName}, ${city}${country ? `, ${country}` : ''}`);
    if (city) add(`${city}${country ? `, ${country}` : ''}`);

    // Structured search is deliberately last. It is useful when the street and
    // city are known, but must never override a better free-form POI result.
    const structuredCandidates = [];
    if (street && city) {
      for (const s of spellingVariants(street)) {
        structuredCandidates.push({
          street: s,
          city,
          ...(country ? { country } : {}),
        });
      }
    }

    let first = null;
    let approximate = false;

    // First pass: use a small set of focused queries. Keep the city fallback
    // explicitly in this pass; otherwise limiting the request count can
    // accidentally skip the useful city-level match for Pakistani addresses.
    const focusedQueries = [];
    const addFocused = (q) => {
      const value = String(q || '').trim();
      if (value && !focusedQueries.includes(value)) focusedQueries.push(value);
    };
    addFocused(normalized);
    addFocused(withoutCountry);
    if (street && locality && city) {
      addFocused(street + ', ' + locality + ', ' + city + (country ? ', ' + country : ''));
    }
    if (street && city) {
      addFocused(street + ', ' + city + (country ? ', ' + country : ''));
    }
    if (locality && city) {
      addFocused(locality + ', ' + city + (country ? ', ' + country : ''));
    }
    if (poiName && city) {
      addFocused(poiName + ', ' + city + (country ? ', ' + country : ''));
    }
    if (city) addFocused(city + (country ? ', ' + country : ''));
    for (let i = 0; i < Math.min(focusedQueries.length, 8); i += 1) {
      const data = await search(focusedQueries[i]);
      if (Array.isArray(data) && data.length) {
        // Prefer results in the same city when a city was identified.
        const ranked = data
          .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
          .sort((a, b) => {
            const aCity = String(a.address?.city || a.address?.town || a.address?.municipality || a.address?.village || '').toLowerCase();
            const bCity = String(b.address?.city || b.address?.town || b.address?.municipality || b.address?.village || '').toLowerCase();
            const target = city.toLowerCase();
            const aMatch = target && aCity.includes(target) ? 1 : 0;
            const bMatch = target && bCity.includes(target) ? 1 : 0;
            return bMatch - aMatch;
          });
        if (ranked.length) {
          first = ranked[0];
          break;
        }
      }
      if (i < queries.length - 1) await sleep(1100);
    }

    // Second pass: structured street/city fallback.
    if (!first) {
      for (let i = 0; i < structuredCandidates.length; i += 1) {
        const data = await search('', structuredCandidates[i]);
        if (Array.isArray(data) && data.length) {
          first = data[0];
          approximate = true;
          break;
        }
        if (i < structuredCandidates.length - 1) await sleep(1100);
      }
    }

    // Production fallback: Photon uses OpenStreetMap data through a separate
    // geocoding service. This prevents a temporary Nominatim throttle/outage
    // from turning every valid address into "Address not found".
    if (!first) {
      try {
        const photonUrl = new URL('https://photon.komoot.io/api/');
        photonUrl.searchParams.set('q', city ? normalized + ', ' + city + (country ? ', ' + country : '') : normalized);
        photonUrl.searchParams.set('limit', '5');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const resp = await fetch(photonUrl, {
            headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
            signal: controller.signal,
          });
          if (resp.ok) {
            const data = await resp.json();
            const features = Array.isArray(data?.features) ? data.features : [];
            const targetCity = city.toLowerCase();
            const ranked = features
              .filter((item) => Number.isFinite(Number(item?.geometry?.coordinates?.[1])) && Number.isFinite(Number(item?.geometry?.coordinates?.[0])))
              .sort((a, b) => {
                const aCity = String(a?.properties?.city || a?.properties?.town || a?.properties?.municipality || '').toLowerCase();
                const bCity = String(b?.properties?.city || b?.properties?.town || b?.properties?.municipality || '').toLowerCase();
                return (targetCity && bCity.includes(targetCity) ? 1 : 0) - (targetCity && aCity.includes(targetCity) ? 1 : 0);
              });
            const item = ranked[0];
            if (item) {
              const [lng, lat] = item.geometry.coordinates;
              first = {
                lat,
                lon: lng,
                display_name: item.properties?.name
                  ? [item.properties.name, item.properties.street, item.properties.city || item.properties.town, item.properties.country].filter(Boolean).join(', ')
                  : address,
              };
              approximate = true;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (fallbackError) {
        console.error('Photon geocoding fallback error:', fallbackError.message);
      }
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
        approximate,
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
