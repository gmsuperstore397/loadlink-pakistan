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
      url.searchParams.set('countrycodes', 'pk');

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

    // Pakistani addresses are often written as a chain of landmarks rather
    // than one OSM-indexed address. Keep the map usable even when the exact
    // landmark chain is not indexed: derive the strongest locality/city and
    // return the best available nearby map point.
    const isPakistanAddress = /\b(?:pakistan|karachi|lahore|islamabad|rawalpindi|peshawar|quetta|multan|faisalabad|hyderabad)\b/i.test(normalized);

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
    const stateName = /\bkarachi\b/i.test(city) ? 'Sindh' : '';
    const landmarkParts = coreParts.filter((p) => p !== poiName && p !== street && p !== city && !relational.test(p));

    // Build several focused free-form queries. Nominatim processes free-form
    // searches left-to-right/right-to-left, and commas improve performance.
    for (const variant of spellingVariants(normalized)) add(variant);
    for (const variant of spellingVariants(withoutCountry)) add(variant);
    if (street && city) {
      for (const s of spellingVariants(street)) {
        add(`${s}, ${city}${country ? `, ${country}` : ''}`);
        add(`${s.replace(/^main\s+/i, '')}, ${city}${country ? `, ${country}` : ''}`);
        if (locality) add(`${s}, ${locality}, ${city}${country ? `, ${country}` : ''}`);
      }
    }
    if (locality && city) add(`${locality}, ${city}${country ? `, ${country}` : ''}`);
    for (const part of landmarkParts.slice(0, 5)) add(`${part}, ${city}${country ? `, ${country}` : ''}`);
    if (poiName && city) add(`${poiName}, ${city}${country ? `, ${country}` : ''}`);
    if (city) add(`${city}${country ? `, ${country}` : ''}`);

    // Structured search is deliberately last. It is useful when the street and
    // city are known, but must never override a better free-form POI result.
    const structuredCandidates = [];
    if (street && city) {
      for (const s of spellingVariants(street)) {
        const cleanStreet = s.replace(/^main\s+/i, '').trim();
        const base = { city, ...(stateName ? { state: stateName } : {}), country: country || 'Pakistan' };
        structuredCandidates.push({ street: s, ...base });
        if (cleanStreet !== s) structuredCandidates.push({ street: cleanStreet, ...base });
        if (poiName) structuredCandidates.push({ amenity: poiName, street: cleanStreet, ...base });
      }
    }
    for (const part of landmarkParts.slice(0, 4)) {
      if (city && part.length >= 3) {
        structuredCandidates.push({ amenity: part, city, ...(stateName ? { state: stateName } : {}), country: country || 'Pakistan' });
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
    for (const variant of spellingVariants(normalized)) addFocused(variant);
    for (const variant of spellingVariants(withoutCountry)) addFocused(variant);
    if (street && locality && city) {
      for (const s of spellingVariants(street)) {
        addFocused(s + ', ' + locality + ', ' + city + (country ? ', ' + country : ''));
      }
    }
    if (street && city) {
      for (const s of spellingVariants(street)) {
        addFocused(s + ', ' + city + (country ? ', ' + country : ''));
      }
    }
    if (locality && city) {
      addFocused(locality + ', ' + city + (country ? ', ' + country : ''));
    }
    if (poiName && city) {
      addFocused(poiName + ', ' + city + (country ? ', ' + country : ''));
    }
    if (city) addFocused(city + (country ? ', ' + country : ''));

    // Try the focused queries first, but do not stop at the first weak city
    // result. Prefer a result whose display/address contains the searched
    // locality, street or POI.
    const relevanceTerms = [poiName, street, ...localityParts].filter(Boolean).map(x => x.toLowerCase());
    const rankResults = (items) => items
      .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      .sort((a, b) => {
        const score = (item) => {
          const text = [item.display_name, item.name, JSON.stringify(item.address || {})].join(' ').toLowerCase();
          const cityText = String(item.address?.city || item.address?.town || item.address?.municipality || item.address?.village || '').toLowerCase();
          let n = 0;
          if (city && cityText.includes(city.toLowerCase())) n += 20;
          for (const term of relevanceTerms) if (term && text.includes(term)) n += 10;
          return n;
        };
        return score(b) - score(a);
      });

    // Try more than the single full-string query. Pakistani addresses often
    // contain local landmarks that are not indexed as one exact Nominatim POI.
    // Keep requests sequential so we respect the public geocoder rate limit.
    // Try progressively shorter address fragments. This is important for
    // Pakistani landmark-heavy addresses: a POI/landmark may be indexed while
    // the user's full human-written address is not.
    const expandedQueries = [...focusedQueries];
    if (coreParts.length > 1) {
      for (let start = 0; start < coreParts.length - 1; start += 1) {
        const fragment = coreParts.slice(start).join(', ');
        addFocused(fragment + (country ? ', ' + country : ''));
      }
      // Also try the strongest locality/city suffixes.
      for (let take = Math.min(4, coreParts.length); take >= 2; take -= 1) {
        const fragment = coreParts.slice(-take).join(', ');
        addFocused(fragment + (country ? ', ' + country : ''));
      }
    }
    for (const q of expandedQueries) {
      if (!focusedQueries.includes(q)) focusedQueries.push(q);
    }

    for (let i = 0; i < focusedQueries.length && i < 10 && !first; i += 1) {
      const data = await search(focusedQueries[i]);
      if (Array.isArray(data) && data.length) {
        const ranked = rankResults(data);
        if (ranked.length) {
          first = ranked[0];
          // If we had to fall back from the complete query to a focused query,
          // tell the UI that the pin is an address match rather than an exact
          // house/POI match.
          approximate = i > 0;
        }
      }
      if (!first && i < Math.min(focusedQueries.length, 4) - 1) await sleep(1100);
    }

    // A clean street/locality/city query is more reliable for landmark-heavy
    // Pakistani addresses when the full free-form string is not indexed.
    if (!first && street && city) {
      await sleep(1100);
      const cleanQuery = [street, locality, city, country].filter(Boolean).join(', ');
      const data = await search(cleanQuery);
      if (Array.isArray(data) && data.length) {
        const ranked = rankResults(data);
        if (ranked.length) {
          first = ranked[0];
          approximate = true;
        }
      }
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
    // Final broad fallback: for Pakistan, try the strongest locality/city
    // terms independently before declaring the address missing.
    if (!first && isPakistanAddress) {
      const fallbackQueries = [];
      const addFallback = (q) => {
        const v = String(q || '').trim();
        if (v && !fallbackQueries.includes(v)) fallbackQueries.push(v);
      };
      if (street && city) addFallback(street.replace(/^main\s+/i, '').trim() + ', ' + city);
      for (const p of landmarkParts.slice(-3)) if (city) addFallback(p + ', ' + city);
      if (locality && city) addFallback(locality + ', ' + city);
      if (city) addFallback(city + ', Pakistan');

      for (const q of fallbackQueries) {
        await sleep(1100);
        try {
          const data = await search(q);
          const ranked = rankResults(data || []);
          if (ranked.length) {
            first = ranked[0];
            approximate = true;
            break;
          }
        } catch (_) {}
      }
    }

    if (!first) {
      // Photon fallback: search the complete address and then the strongest
      // street/landmark/locality fragments. This is much more reliable for
      // Pakistani addresses written as a chain of landmarks.
      const photonQueries = [];
      const addPhotonQuery = (q) => {
        const v = String(q || '').replace(/\s+/g, ' ').trim();
        if (v && !photonQueries.includes(v)) photonQueries.push(v);
      };
      addPhotonQuery(normalized + (country ? ', ' + country : ', Pakistan'));
      if (street && city) addPhotonQuery(street.replace(/^main\s+/i, '').trim() + ', ' + city);
      for (const p of landmarkParts.slice(0, 5)) if (city) addPhotonQuery(p + ', ' + city);
      if (locality && city) addPhotonQuery(locality + ', ' + city);
      if (city) addPhotonQuery(city + ', Pakistan');

      for (const photonQuery of photonQueries) {
        try {
          const photonUrl = new URL('https://photon.komoot.io/api/');
          photonUrl.searchParams.set('q', photonQuery);
          photonUrl.searchParams.set('limit', '10');
          photonUrl.searchParams.set('lang', 'en');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const resp = await fetch(photonUrl, {
              headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
              signal: controller.signal,
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const features = Array.isArray(data?.features) ? data.features : [];
            const targetCity = city.toLowerCase();
            const ranked = features
              .filter((item) => Number.isFinite(Number(item?.geometry?.coordinates?.[1])) && Number.isFinite(Number(item?.geometry?.coordinates?.[0])))
              .sort((a, b) => {
                const cityOf = (x) => String(x?.properties?.city || x?.properties?.town || x?.properties?.municipality || '').toLowerCase();
                const aCity = cityOf(a);
                const bCity = cityOf(b);
                return (targetCity && bCity.includes(targetCity) ? 1 : 0) - (targetCity && aCity.includes(targetCity) ? 1 : 0);
              });
            const item = ranked[0];
            if (item) {
              const [lng, lat] = item.geometry.coordinates;
              first = {
                lat,
                lon: lng,
                display_name: [
                  item.properties?.name,
                  item.properties?.street,
                  item.properties?.district,
                  item.properties?.city || item.properties?.town,
                  item.properties?.country,
                ].filter(Boolean).join(', ') || address,
              };
              approximate = true;
              break;
            }
          } finally {
            clearTimeout(timeout);
          }
        } catch (_) {}
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
