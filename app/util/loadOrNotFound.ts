import { notFound } from '@tanstack/react-router';

export async function loadOrNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof Response && error.status === 404) {
      throw notFound();
    }
    throw error;
  }
}
