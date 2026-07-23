import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ComponentProps } from 'react';
import { type LegacyTriggerProps, renderTrigger } from './renderTrigger';

function Provider({
  delayDuration,
  ...props
}: ComponentProps<typeof BaseTooltip.Provider> & { delayDuration?: number }) {
  return <BaseTooltip.Provider delay={delayDuration} {...props} />;
}

function Trigger(props: LegacyTriggerProps<typeof BaseTooltip.Trigger>) {
  return renderTrigger(BaseTooltip.Trigger, props);
}

function Content({
  align,
  side,
  sideOffset,
  collisionPadding,
  ...props
}: ComponentProps<typeof BaseTooltip.Popup> &
  Pick<
    ComponentProps<typeof BaseTooltip.Positioner>,
    'align' | 'side' | 'sideOffset' | 'collisionPadding'
  >) {
  return (
    <BaseTooltip.Positioner
      align={align}
      collisionPadding={collisionPadding}
      side={side}
      sideOffset={sideOffset}
    >
      <BaseTooltip.Popup {...props} />
    </BaseTooltip.Positioner>
  );
}

export const Tooltip = {
  Provider,
  Root: BaseTooltip.Root,
  Trigger,
  Portal: BaseTooltip.Portal,
  Content,
  Arrow: BaseTooltip.Arrow,
};
