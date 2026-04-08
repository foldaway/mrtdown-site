import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';

type SourceType =
  | { type: 'twitter'; accountName: string }
  | { type: 'mastodon'; accountName: string }
  | { type: 'cna' }
  | { type: 'straits_times' }
  | { type: 'reddit' };

interface ContentProps {
  sourceType: SourceType;
}

const Content: React.FC<ContentProps> = (props) => {
  const { sourceType } = props;

  switch (sourceType.type) {
    case 'twitter': {
      switch (sourceType.accountName) {
        case 'SMRT_Singapore': {
          return <FormattedMessage id="source.smrt" defaultMessage="SMRT" />;
        }
        case 'SBSTransit_Ltd': {
          return (
            <FormattedMessage id="source.sbs" defaultMessage="SBS Transit" />
          );
        }
      }
      break;
    }
    case 'mastodon': {
      switch (sourceType.accountName) {
        case '@ltatrainservicealerts': {
          return (
            <FormattedMessage
              id="source.mytransport_sg"
              defaultMessage="MyTransport SG"
            />
          );
        }
      }
      break;
    }
    case 'cna': {
      return <FormattedMessage id="source.cna" defaultMessage="CNA" />;
    }
    case 'straits_times': {
      return (
        <FormattedMessage
          id="source.straitstimes"
          defaultMessage="The Straits Times"
        />
      );
    }
    case 'reddit': {
      return <FormattedMessage id="source.reddit" defaultMessage="Reddit" />;
    }
  }

  return null;
};

interface Props {
  sourceUrl: string;
}

export const Source: React.FC<Props> = (props) => {
  const { sourceUrl } = props;

  const sourceType = useMemo<SourceType | null>(() => {
    const _url = new URL(sourceUrl);

    switch (_url.hostname) {
      case 'twitter.com':
      case 'x.com': {
        const accountName = _url.pathname.split('/')[1];
        return { type: 'twitter', accountName };
      }
      case 'mastodon.social': {
        const accountName = _url.pathname.split('/')[1];
        return { type: 'mastodon', accountName };
      }
      case 'www.channelnewsasia.com': {
        return { type: 'cna' };
      }
      case 'www.straitstimes.com': {
        return { type: 'straits_times' };
      }
      case 'www.reddit.com': {
        return { type: 'reddit' };
      }
      default: {
        return null;
      }
    }
  }, [sourceUrl]);

  if (sourceType == null) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 text-xs dark:bg-gray-700 dark:text-gray-300">
      <span className="truncate">
        <Content sourceType={sourceType} />
      </span>
    </div>
  );
};
