import classNames from 'classnames';
import type React from 'react';

interface Props {
  size: 'small' | 'medium' | 'large';
  className?: string;
}

const Spinner: React.FC<Props> = (props) => {
  const { size, className } = props;

  return (
    <div className="flex items-center justify-center">
      <div
        className={classNames(
          className,
          'animate-spin rounded-full border-gray-700 border-t-gray-500 dark:border-t-gray-600 dark:text-gray-400',
          {
            'h-4 w-4 border-2': size === 'small',
            'h-8 w-8 border-4': size === 'medium',
            'h-12 w-12 border-4': size === 'large',
          },
        )}
      />
    </div>
  );
};

export default Spinner;
