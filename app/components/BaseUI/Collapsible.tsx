import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { type LegacyTriggerProps, renderTrigger } from './renderTrigger';

function Root(props: LegacyTriggerProps<typeof BaseCollapsible.Root>) {
  return renderTrigger(BaseCollapsible.Root, props);
}

function Trigger(props: LegacyTriggerProps<typeof BaseCollapsible.Trigger>) {
  return renderTrigger(BaseCollapsible.Trigger, props);
}

function Content(props: LegacyTriggerProps<typeof BaseCollapsible.Panel>) {
  return renderTrigger(BaseCollapsible.Panel, props);
}

export const Collapsible = {
  Root,
  Trigger,
  Content,
};
