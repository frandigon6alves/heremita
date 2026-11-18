# T10-T11-contract — DONE (T10 x, T11 x in SPEC; ID-T10, ID-T11 lines in §C deviations)

## Exports (stable; `@heremita/shared` = everything below except openapi)
- limits.ts: LIMITS (flat + SEARCH_LIMIT{default,max} + PAGE_SIZES{trips,publicTrips,userLists,reviews,blocks,moderation}{default,max} + PLACE_LABEL_MAX, REPORT_EXCERPT_MAX, CURSOR_MAX, ZOOM_MAX)
- text.ts: cleanText(s), textSchema(min,max)
- common.ts: idSchema, timestampSchema, isoDateSchema, yearMonthSchema, localeSchema/Locale, themeSchema/Theme, travelModeSchema/TravelMode, placeCategorySchema/PlaceCategory, longitudeSchema, latitudeSchema, lngLatSchema/LngLat (output), lngLatInputSchema (strict), cursorSchema, limitQuery(max,fallback), pageQuerySchema({default,max}), pageSchema(item), Page<T>, userCardSchema/UserCard
- problem.ts: PROBLEM_CONTENT_TYPE, problemFieldErrorSchema, problemDetailsSchema (code REQUIRED string; currentPlanVersion?, tripPlaceId?), ProblemDetails
- error-codes.ts: ERROR_STATUS (code→status), ErrorCode, errorCodeSchema, ERROR_TITLES
- auth.ts: emailSchema, passwordSchema, currentPasswordSchema, displayNameSchema, signUpBodySchema/SignUpBody, logInBodySchema/LogInBody
- me.ts: userRoleSchema, meSchema/Me, updateMeBodySchema, changePasswordBodySchema, deleteAccountBodySchema (+ types)
- users.ts: userProfileSchema/UserProfile
- places.ts: placeKeySchema, osmTypeSchema, placeSourceSchema, placeKindSchema, placeSummarySchema, ratingSummarySchema, boundingBoxSchema, placeAddressSchema, placeResultSchema, placeResultsSchema ({items}), placeSearchIntentSchema, searchPlacesQuerySchema (near/within/categories strings → parsed objects/arrays on output), reverseQuerySchema, placeDetailSchema (+ types)
- trips.ts: visibilitySchema, shareTokenSchema, countryCodeSchema, destinationSchema (INPUT), tripDestinationSchema (OUTPUT, id Destination), createTripBodySchema, updateTripBodySchema, copyTripBodySchema, tripOwnerSchema, tripPublicSchema, tripSchema, myTripCardSchema, publicTripCardSchema, shareTokenResponseSchema (+ types)
- plan.ts: stopSchema, dayOwnerSchema, dayViewerSchema, tripPlaceOwnerSchema, tripPlaceViewerSchema, legSummarySchema, dayRouteSummarySchema, tripPlanOwnerSchema, tripPlanViewerSchema, tripPlanSchema, addTripPlaceBodySchema(+Response), updateTripPlaceBodySchema(+Response), createDayBodySchema(+Response), updateDayBodySchema, addStopBodySchema(+Response), stopOrderBodySchema, stopPlacementBodySchema, updateStopBodySchema, planChangeSchema (+ types)
- routes.ts: routeQuerySchema, routeProviderSchema, routeQualitySchema, legSchema, dayRouteSchema, orderSuggestionQuerySchema (keepLast 'true'|'false' → bool), orderSuggestionSchema
- reviews.ts: reviewSortSchema, reviewStatusSchema, ratingSchema, putReviewBodySchema, reviewSchema/Review, placeReviewsQuerySchema
- reports.ts: reportReasonSchema, reportTargetTypeSchema, reportStatusSchema, createReportBodySchema, createdIdSchema, reportItemSchema, moderationDecisionSchema, moderationDecisionBodySchema, reportStatusQuerySchema
- discovery.ts: publicTripsQuerySchema
- api/endpoints.ts: HttpMethod, EndpointAuth, THROTTLE_NAMES/ThrottleName, EndpointDef, endpoint(), implicitErrorCodes(def), endpoints (51, keyed by §I.api name), Endpoints, EndpointName, EndpointInput<E> (z.output), EndpointRequest<E> (z.input, for web), EndpointOutput<E>
- `@heremita/shared/openapi`: buildOpenApiDocument(), OpenApiDocument. `@heremita/shared/openapi.json`: committed file.

## Commands
- pnpm --filter @heremita/shared openapi:generate (build + write + prettier)
- shared typecheck/lint/test green (177 tests)

## Known red outside lane (CD3 code required): api problem-details.filter.ts typecheck; web query-client.test.ts typecheck; web health-status.test.tsx fixture.
