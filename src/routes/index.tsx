import { DateTime } from 'luxon';
import { Link } from 'react-router';
import { Outlet } from 'react-router';

const HomePage: React.FC = () => (
  <>
    <header className="flex w-full flex-col items-center p-10">
      <Link to="/">
        <h1 className="px-2 font-bold text-gray-900 italic hover:underline dark:text-gray-200">
          mrtdown
        </h1>
      </Link>
      <p className="max-w-4xl text-center text-gray-500 text-sm dark:text-gray-400">
        unofficial community resource tracking official announcements and
        community reports
      </p>
    </header>
    <main className="mx-4 flex max-w-5xl flex-col bg-gray-50 lg:mx-auto dark:bg-gray-900">
      <Outlet />
    </main>
    <footer className="flex flex-col items-center p-10">
      <span className="text-gray-500 text-sm">
        &copy; {DateTime.now().toFormat('y')} mrtdown
      </span>
    </footer>
  </>
);

export const Component = HomePage;
