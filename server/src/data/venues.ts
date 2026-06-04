import { join } from 'node:path';
import type { Venue } from '@sweepstake/shared';
import { readCsv } from './csv';
import { DATASETS_DIR } from './paths';

type VenueRow = {
  id: string;
  city_name: string;
  country: string;
  venue_name: string;
  region_cluster: string;
  airport_code: string;
};

export function loadVenues(): Venue[] {
  const rows = readCsv<VenueRow>(join(DATASETS_DIR, 'host_cities.csv'));
  return rows.map(
    (r): Venue => ({
      id: Number(r.id),
      city: r.city_name,
      country: r.country,
      venue: r.venue_name,
      regionCluster: r.region_cluster as Venue['regionCluster'],
      airportCode: r.airport_code,
    }),
  );
}
