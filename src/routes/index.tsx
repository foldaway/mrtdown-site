import classNames from 'classnames';
import { DateTime } from 'luxon';
import type { NavLinkProps } from 'react-router';
import { NavLink } from 'react-router';
import { Link } from 'react-router';
import { Outlet } from 'react-router';

const navLinkClassNameFunction: NavLinkProps['className'] = ({ isActive }) => {
  return classNames(
    'rounded-md px-4 py-1 text-base font-medium hover:bg-gray-200 dark:hover:bg-gray-800',
    {
      'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200': isActive,
      'text-gray-600 dark:text-gray-400': !isActive,
    },
  );
};

const HomePage: React.FC = () => (
  <>
    <header className="flex w-full flex-col items-center p-10">
      <Link to="/">
        <h1 className="px-2 font-bold text-gray-900 italic hover:underline dark:text-gray-200">
          mrtdown
        </h1>
      </Link>
      <p className="max-w-4xl text-center text-gray-500 text-sm dark:text-gray-400">
        community-run transit monitoring
      </p>

      <div className="mt-6 flex items-center gap-x-2">
        <NavLink to="/" className={navLinkClassNameFunction}>
          Home
        </NavLink>
        <NavLink to="/history" className={navLinkClassNameFunction}>
          History
        </NavLink>
        <NavLink to="/statistics" className={navLinkClassNameFunction}>
          Statistics
        </NavLink>
        <NavLink to="/about" className={navLinkClassNameFunction}>
          About
        </NavLink>
      </div>
    </header>
    <main className="mx-4 flex max-w-5xl flex-col bg-gray-50 lg:mx-auto dark:bg-gray-900">
      <Outlet />
    </main>
    <footer className="flex flex-col items-center p-10">
      <span className="text-gray-500 text-sm">
        &copy; {DateTime.now().toFormat('y')} mrtdown
      </span>
      <span className="text-gray-500 text-sm italic">
        This is an independent platform not affiliated with any public transport
        operator.
      </span>
    </footer>
  </>
);

export const Component = HomePage;
