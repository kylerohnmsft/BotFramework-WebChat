import {
  any,
  array,
  integer,
  literal,
  minValue,
  nonEmpty,
  number,
  object,
  optional,
  pipe,
  safeParse,
  string,
  undefinedable,
  union
} from 'valibot';
import type { InferOutput } from 'valibot';

import { type WebChatActivity } from '../types/WebChatActivity';
import getOrgSchemaMessage from './getOrgSchemaMessage';

const EMPTY_ARRAY = Object.freeze([]);

interface StreamingData {
  streamId?: string;
  streamSequence?: number;
  streamType: string;
}

const streamSequenceSchema = pipe(number(), integer(), minValue(1));

// Extra fields required for each activity
const activityExtras = {
  // "text" is optional. If not set or empty, it presents a contentless activity.
  text: optional(undefinedable(string())),
  attachments: optional(array(any()), EMPTY_ARRAY),
  id: string()
};

const { text: _text, ...activityExtrasFinal } = activityExtras;

// Interim or Informative Activities
const activeSchema = object({
  // "streamId" is optional for the very first activity in the session.
  streamId: optional(undefinedable(string())),
  streamSequence: streamSequenceSchema,
  streamType: union([literal('streaming'), literal('informative')])
});

// Final Activities
const finalActivitySchema = object({
  // "streamId" is required for the final activity in the session.
  // The final activity must not be the sole activity in the session.
  streamId: pipe(string(), nonEmpty()),
  streamType: literal('final')
});

const channelDataStreamingActivitySchema = union([
  // Interim or Informative message
  // Informative may not have "text", but should have abstract instead (checked later)
  object({
    type: literal('typing'),
    channelData: activeSchema,
    entities: optional(array(any()), EMPTY_ARRAY),
    ...activityExtras
  }),
  // Conclude with a message.
  object({
    // If "text" is empty, it represents "regretting" the livestream.
    type: literal('message'),
    channelData: finalActivitySchema,
    entities: optional(array(any()), EMPTY_ARRAY),
    ...activityExtras
  }),
  // Conclude without a message.
  object({
    // If "text" is not set or empty, it represents "regretting" the livestream.
    type: literal('typing'),
    channelData: finalActivitySchema,
    entities: optional(array(any()), EMPTY_ARRAY),
    text: optional(undefinedable(literal(''))),
    ...activityExtrasFinal
  })
]);

const entitiesStreamingActivitySchema = union([
  // Interim or Informative message
  // Informative may not have "text", but should have abstract instead (checked later)
  object({
    type: literal('typing'),
    entities: array(activeSchema),
    channelData: any(),
    ...activityExtras
  }),
  // Conclude with a message.
  object({
    // If "text" is empty, it represents "regretting" the livestream.
    type: literal('message'),
    entities: array(finalActivitySchema),
    channelData: any(),
    ...activityExtras
  }),
  // Conclude without a message.
  object({
    // If "text" is empty, it represents "regretting" the livestream.
    type: literal('typing'),
    entities: array(finalActivitySchema),
    channelData: any(),
    text: optional(undefinedable(literal(''))),
    ...activityExtrasFinal
  })
]);

type EntitiesStreamingActivity = InferOutput<typeof entitiesStreamingActivitySchema>;
type ChannelDataStreamingActivity = InferOutput<typeof channelDataStreamingActivitySchema>;

/**
 * Gets the livestreaming metadata of the activity, or `undefined` if the activity is not participating in a livestreaming session.
 *
 * - `sessionId` - ID of the livestreaming session
 * - `sequenceNumber` - sequence number of the activity
 * - `type`
 *   - `"contentless"` - ongoing but no content, should show indicator
 *   - `"interim activity"` - current response, could be partial-from-start, or complete response.
 *     More activities are expected. Future interim activities always replace past interim activities, enable erasing or backtracking response.
 *   - `"informative message"` - optional side-channel informative message describing the current response, e.g. "Searching your document library".
 *     Always replace past informative messages. May interleave with interim activities.
 *   - `"final activity"` - complete-and-final response, always replace past interim activities and remove all informative messages.
 *     This activity indicates end of the session, all future activities must be ignored.
 *   - `undefined` - not part of a livestream session or the activity is not valid
 *
 * @returns {object} Livestreaming metadata of the activity, or `undefined` if the activity is not participating in a livestreaming session.
 */
export default function getActivityLivestreamingMetadata(activity: WebChatActivity):
  | Readonly<{
      sessionId: string;
      sequenceNumber: number;
      type: 'contentless' | 'final activity' | 'informative message' | 'interim activity';
    }>
  | undefined {
  let activityData: EntitiesStreamingActivity | ChannelDataStreamingActivity | undefined;

  let streamingData: StreamingData | undefined;

  if (activity.entities) {
    const result = safeParse(entitiesStreamingActivitySchema, activity);
    activityData = result.success ? result.output : undefined;
    streamingData = result.success ? activityData.entities[0] : undefined;
  }

  if (!activityData && activity.channelData) {
    const result = safeParse(channelDataStreamingActivitySchema, activity);
    activityData = result.success ? result.output : undefined;
    streamingData = result.success ? activityData.channelData : undefined;
  }

  if (activityData && streamingData) {
    // If the activity is the first in the session, session ID should be the activity ID.
    const sessionId = streamingData.streamId || activityData.id;

    return Object.freeze(
      streamingData.streamType === 'final'
        ? {
            sequenceNumber: Infinity,
            sessionId,
            type: 'final activity'
          }
        : {
            sequenceNumber: streamingData.streamSequence,
            sessionId,
            type: !(
              activityData.text ||
              activityData.attachments?.length ||
              ('entities' in activityData && getOrgSchemaMessage(activity.entities)?.abstract)
            )
              ? 'contentless'
              : streamingData.streamType === 'informative'
                ? 'informative message'
                : 'interim activity'
          }
    );
  }

  return undefined;
}
