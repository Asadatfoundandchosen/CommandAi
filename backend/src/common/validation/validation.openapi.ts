/**
 * Shared OpenAPI components for request validation (included via swagger `apis` glob).
 *
 * @openapi
 * components:
 *   schemas:
 *     ValidationErrorDetail:
 *       type: object
 *       required: [field, message]
 *       properties:
 *         field:
 *           type: string
 *           description: Dot-separated path to the invalid field
 *           example: email
 *         message:
 *           type: string
 *           example: '"email" must be a valid email'
 *     ValidationErrorResponse:
 *       type: object
 *       required: [error, details]
 *       properties:
 *         error:
 *           type: string
 *           enum: [Validation Error]
 *         details:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ValidationErrorDetail'
 *   responses:
 *     ValidationError:
 *       description: Request body, query, or path failed Joi/Zod validation
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ValidationErrorResponse'
 */

export {};
