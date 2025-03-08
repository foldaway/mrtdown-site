import { RouterProvider } from 'react-router';
import { createBrowserRouter, type RouteObject } from 'react-router';

const routes: RouteObject[] = [
  {
    lazy: () => import('./routes/index'),
    children: [
      {
        index: true,
        lazy: () => import('./routes/_index'),
      },
      {
        path: 'issues',
        children: [
          {
            path: ':issueId',
            lazy: () => import('./routes/issues.$issueId'),
          },
        ],
      },
      {
        path: 'history',
        children: [{ index: true, lazy: () => import('./routes/history') }],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
