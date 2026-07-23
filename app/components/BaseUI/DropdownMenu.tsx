import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ComponentProps } from 'react';
import { type LegacyTriggerProps, renderTrigger } from './renderTrigger';

function Trigger(props: LegacyTriggerProps<typeof BaseMenu.Trigger>) {
  return renderTrigger(BaseMenu.Trigger, props);
}

function Content({
  align,
  side,
  sideOffset,
  collisionPadding,
  ...props
}: ComponentProps<typeof BaseMenu.Popup> &
  Pick<
    ComponentProps<typeof BaseMenu.Positioner>,
    'align' | 'side' | 'sideOffset' | 'collisionPadding'
  >) {
  return (
    <BaseMenu.Positioner
      align={align}
      collisionPadding={collisionPadding}
      side={side}
      sideOffset={sideOffset}
    >
      <BaseMenu.Popup {...props} />
    </BaseMenu.Positioner>
  );
}

export const DropdownMenu = {
  Root: BaseMenu.Root,
  Trigger,
  Portal: BaseMenu.Portal,
  Content,
  Item: BaseMenu.Item,
  Separator: BaseMenu.Separator,
  Label: BaseMenu.GroupLabel,
};
