import {
  createElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';

export type LegacyTriggerProps<T extends React.ElementType> =
  ComponentProps<T> & {
    asChild?: boolean;
    children?: ReactNode;
  };

export function renderTrigger<T extends React.ElementType>(
  Component: T,
  { asChild, children, ...props }: LegacyTriggerProps<T>,
) {
  const componentProps = props as ComponentProps<T>;

  if (asChild) {
    return createElement(Component, {
      ...componentProps,
      render: children as ReactElement,
    });
  }

  return createElement(Component, componentProps, children);
}
