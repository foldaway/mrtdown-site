import { createServerFn } from '@tanstack/react-start';
import { getSystemMapData } from './db/queries/system-map';

export const getSystemMapFn = createServerFn({ method: 'GET' }).handler(() =>
  getSystemMapData(),
);
