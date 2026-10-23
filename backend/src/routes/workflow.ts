import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams, moveTargetSchema } from '../schemas/common.js';
import { claimNextCard } from '../services/claim.js';
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
  setCardFieldValue,
  updateCustomField,
} from '../services/custom-fields.js';
import {
  createCardFromTemplate,
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from '../services/templates.js';

const fieldName = z.string().trim().min(1).max(50);
const fieldOptions = z.array(z.string().trim().min(1).max(50)).max(50);
const templateBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(50_000).nullable().optional().describe('Markdown'),
  checklist: z
    .array(z.string().max(1000))
    .max(100)
    .optional()
    .describe('Item texts in order; blank entries are ignored'),
});

/** Custom fields, card templates and agent claims. */
export const workflowRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/boards/:id/custom-fields',
    { schema: { tags: ['custom fields'], summary: 'List board custom fields', params: idParams } },
    async (request) => listCustomFields(request.params.id),
  );

  app.post(
    '/boards/:id/custom-fields',
    {
      schema: {
        tags: ['custom fields'],
        summary: 'Create a custom field (text, number, select or url)',
        params: idParams,
        body: z.object({
          name: fieldName,
          type: z.enum(['text', 'number', 'select', 'url']),
          options: fieldOptions.optional().describe('Required for select fields'),
        }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createCustomField(request.auth.userId, request.params.id, request.body)),
  );

  app.patch(
    '/custom-fields/:id',
    {
      schema: {
        tags: ['custom fields'],
        summary: 'Rename a custom field or change select options (the type is fixed)',
        params: idParams,
        body: z.object({ name: fieldName, options: fieldOptions }).partial(),
      },
    },
    async (request) => updateCustomField(request.auth.userId, request.params.id, request.body),
  );

  app.delete(
    '/custom-fields/:id',
    {
      schema: {
        tags: ['custom fields'],
        summary: 'Delete a custom field and its values',
        params: idParams,
      },
    },
    async (request, reply) => {
      await deleteCustomField(request.auth.userId, request.params.id);
      return reply.status(204).send();
    },
  );

  app.put(
    '/cards/:id/custom-fields/:fieldId',
    {
      schema: {
        tags: ['custom fields'],
        summary: 'Set (or clear with null/"") the value of a custom field on a card',
        params: z.object({ id: z.uuid(), fieldId: z.uuid() }),
        body: z.object({ value: z.union([z.string(), z.number(), z.null()]) }),
      },
    },
    async (request) =>
      setCardFieldValue(
        request.auth.userId,
        request.params.id,
        request.params.fieldId,
        request.body.value,
      ),
  );

  app.get(
    '/boards/:id/templates',
    { schema: { tags: ['templates'], summary: 'List card templates', params: idParams } },
    async (request) => listTemplates(request.params.id),
  );

  app.post(
    '/boards/:id/templates',
    {
      schema: {
        tags: ['templates'],
        summary: 'Create a card template (description + checklist)',
        params: idParams,
        body: templateBody,
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createTemplate(request.auth.userId, request.params.id, request.body)),
  );

  app.patch(
    '/templates/:id',
    {
      schema: {
        tags: ['templates'],
        summary: 'Update a card template',
        params: idParams,
        body: templateBody.partial(),
      },
    },
    async (request) => updateTemplate(request.auth.userId, request.params.id, request.body),
  );

  app.delete(
    '/templates/:id',
    { schema: { tags: ['templates'], summary: 'Delete a card template', params: idParams } },
    async (request, reply) => {
      await deleteTemplate(request.auth.userId, request.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/lists/:id/cards/from-template',
    {
      schema: {
        tags: ['templates'],
        summary: 'Create a card from a template (title defaults to the template name)',
        params: idParams,
        body: moveTargetSchema.and(
          z.object({ templateId: z.uuid(), title: z.string().trim().min(1).max(500).optional() }),
        ),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createCardFromTemplate(request.auth.userId, request.params.id, request.body)),
  );

  app.post(
    '/boards/:id/claim',
    {
      schema: {
        tags: ['workflow'],
        summary:
          'Atomically take the top card of fromListId, assign it to the caller and move it to the end of toListId',
        params: idParams,
        body: z.object({ fromListId: z.uuid(), toListId: z.uuid() }),
      },
    },
    async (request) =>
      claimNextCard(
        request.auth.userId,
        request.params.id,
        request.body.fromListId,
        request.body.toListId,
      ),
  );
};
