import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ComponentProps } from 'react';
import { type LegacyTriggerProps, renderTrigger } from './renderTrigger';

function Trigger(props: LegacyTriggerProps<typeof BasePopover.Trigger>) {
  return renderTrigger(BasePopover.Trigger, props);
}

function Content({
  align,
  side,
  sideOffset,
  collisionPadding,
  ...props
}: ComponentProps<typeof BasePopover.Popup> &
  Pick<
    ComponentProps<typeof BasePopover.Positioner>,
    'align' | 'side' | 'sideOffset' | 'collisionPadding'
  >) {
  return (
    <BasePopover.Positioner
      align={align}
      collisionPadding={collisionPadding}
      side={side}
      sideOffset={sideOffset}
    >
      <BasePopover.Popup {...props} />
    </BasePopover.Positioner>
  );
}

export const Popover = {
  Root: BasePopover.Root,
  Trigger,
  Portal: BasePopover.Portal,
  Content,
  Arrow: BasePopover.Arrow,
};
