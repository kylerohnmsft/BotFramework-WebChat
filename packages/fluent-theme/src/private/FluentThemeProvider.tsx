/* eslint-disable prefer-arrow-callback */
import { type ActivityMiddleware, type StyleOptions, type TypingIndicatorMiddleware } from 'botframework-webchat-api';
import {
  createActivityBorderMiddleware,
  DecoratorComposer,
  type DecoratorMiddleware
} from 'botframework-webchat-api/decorator';
import { WebChatDecorator } from 'botframework-webchat-component/decorator';
import { Components } from 'botframework-webchat-component';
import React, { memo, type ReactNode } from 'react';

import { ActivityDecorator } from '../components/activity';
import ActivityLoader from '../components/activity/ActivityLoader';
import AssetComposer from '../components/assets/AssetComposer';
import { isLinerMessageActivity, LinerMessageActivity } from '../components/linerActivity';
import { isPreChatMessageActivity, PreChatMessageActivity } from '../components/preChatActivity';
import { PrimarySendBox } from '../components/sendBox';
import { TelephoneKeypadProvider } from '../components/telephoneKeypad';
import { WebChatTheme } from '../components/theme';
import SlidingDotsTypingIndicator from '../components/typingIndicator/SlidingDotsTypingIndicator';
import { createStyles } from '../styles';
import VariantComposer, { VariantList } from './VariantComposer';

const { ThemeProvider } = Components;

type FluentThemeProviderProps = Readonly<{
  children?: ReactNode | undefined;
  variant?: VariantList | undefined;
}>;

const activityMiddleware: readonly ActivityMiddleware[] = Object.freeze([
  () =>
    next =>
    (...args) => {
      const activity = args[0]?.activity;

      // TODO: Should show pre-chat only when it is the very first message in the chat history.
      if (isPreChatMessageActivity(activity)) {
        return () => <PreChatMessageActivity activity={activity} />;
      }

      if (isLinerMessageActivity(activity)) {
        return () => <LinerMessageActivity activity={activity} />;
      }

      const renderActivity = next(...args);

      return renderActivity
        ? (...args) => <ActivityDecorator activity={activity}>{renderActivity(...args)}</ActivityDecorator>
        : renderActivity;
    }
]);

const sendBoxMiddleware = [() => () => () => PrimarySendBox];

const decoratorMiddleware: readonly DecoratorMiddleware[] = Object.freeze([
  createActivityBorderMiddleware(function FluentBorderLoader({ request, Next, ...props }) {
    return (
      <ActivityLoader showLoader={props.showLoader ?? request.livestreamingState === 'preparing'}>
        <Next {...props} showLoader={false} />
      </ActivityLoader>
    );
  })
]);

const styles = createStyles('fluent-theme');

const fluentStyleOptions: StyleOptions = Object.freeze({
  feedbackActionsPlacement: 'activity-actions'
});

const typingIndicatorMiddleware = Object.freeze([
  () =>
    next =>
    (...args) =>
      args[0].visible ? <SlidingDotsTypingIndicator /> : next(...args)
] satisfies TypingIndicatorMiddleware[]);

function FluentThemeProvider({ children, variant = 'fluent' }: FluentThemeProviderProps) {
  return (
    <VariantComposer variant={variant}>
      <WebChatTheme>
        <TelephoneKeypadProvider>
          <ThemeProvider
            activityMiddleware={activityMiddleware}
            sendBoxMiddleware={sendBoxMiddleware}
            styleOptions={fluentStyleOptions}
            styles={styles}
            typingIndicatorMiddleware={typingIndicatorMiddleware}
          >
            <AssetComposer>
              <WebChatDecorator>
                <DecoratorComposer middleware={decoratorMiddleware}>{children}</DecoratorComposer>
              </WebChatDecorator>
            </AssetComposer>
          </ThemeProvider>
        </TelephoneKeypadProvider>
      </WebChatTheme>
    </VariantComposer>
  );
}

export default memo(FluentThemeProvider);
export { type FluentThemeProviderProps };
