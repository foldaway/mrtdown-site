import { createServerFn } from '@tanstack/react-start';
import { getSystemMapData } from './dbQueries/overview';

export const getSystemMapFn = createServerFn({ method: 'GET' }).handler(() =>
  getSystemMapData(),
);
