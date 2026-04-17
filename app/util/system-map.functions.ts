import { createServerFn } from '@tanstack/react-start';
import { getSystemMapData } from './db.queries';

export const getSystemMapFn = createServerFn({ method: 'GET' }).handler(() =>
  getSystemMapData(),
);
