package rule.engine.org.app.domain.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openai.client.OpenAIClient;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import rule.engine.org.app.api.request.AIGenerateRuleRequest;
import rule.engine.org.app.api.request.CreateRuleRequest;
import rule.engine.org.app.api.response.AIGenerateRuleResponse;
import rule.engine.org.app.api.response.RuleFieldMetadata;
import rule.engine.org.app.api.response.RuleFieldMetadata.FieldDefinition;
import rule.engine.org.app.api.response.RuleFieldMetadata.OperatorDefinition;
import rule.engine.org.app.config.OpenAIConfig;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.util.RuleFieldExtractor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for generating rules from natural language input using AI (OpenRouter or OpenAI).
 * This service:
 * 1. Loads metadata constraints (available fields, operators, outputs)
 * 2. Builds a structured prompt with metadata
 * 3. Calls AI API (OpenRouter/OpenAI) to generate rule JSON
 * 4. Validates the generated rule against metadata
 * 5. Returns validated rule or error messages with suggestions
 */
@Service
@Slf4j
public class AIRuleGeneratorService {
    
    private final OpenAIClient openAIClient;
    private final OpenAIConfig openAIConfig;
    private final AIRuleValidationService validationService;
    private final ObjectMapper objectMapper;
    
    public AIRuleGeneratorService(
            @org.springframework.beans.factory.annotation.Autowired(required = false) OpenAIClient openAIClient,
            OpenAIConfig openAIConfig,
            AIRuleValidationService validationService,
            ObjectMapper objectMapper) {
        this.openAIClient = openAIClient;
        this.openAIConfig = openAIConfig;
        this.validationService = validationService;
        this.objectMapper = objectMapper;
    }
    
    /**
     * Generate a rule from natural language input
     * @param request AI generation request with natural language input
     * @return Response containing generated rule and validation status
     */
    public AIGenerateRuleResponse generateRule(AIGenerateRuleRequest request) {
        AIGenerateRuleResponse.AIGenerateRuleResponseBuilder responseBuilder = AIGenerateRuleResponse.builder();
        
        // Check if AI features are enabled
        if (openAIClient == null || !openAIConfig.getEnabled()) {
            return responseBuilder
                .success(false)
                .errorMessage("AI features are disabled. Set AI_ENABLED=true and provide AI_API_KEY to use this feature.")
                .suggestions(List.of(
                    "Set environment variable: AI_ENABLED=true",
                    "Set environment variable: AI_API_KEY=your-api-key",
                    "Optional: Set AI_PROVIDER=openrouter (default) or openai",
                    "Restart the application after setting environment variables"
                ))
                .build();
        }
        
        try {
            log.info("Starting AI rule generation for input: '{}'", request.getNaturalLanguageInput());
            
            // Step 1: Get metadata for the specified fact type
            String factType = request.getFactType() != null ? request.getFactType() : "Declaration";
            RuleFieldMetadata metadata = getMetadata(factType);
            
            // Step 2: Build prompt with metadata constraints
            String prompt = buildPrompt(request, metadata, factType);
            // Log prompt for debugging (may be large)
            log.info("AI prompt (factType={}): {}", factType, prompt);
            
            // Step 3: Call AI API (OpenRouter or OpenAI)
            String aiResponse = callOpenAI(prompt);
            
            // Step 4: Parse AI response to CreateRuleRequest
            CreateRuleRequest generatedRule = parseAIResponse(aiResponse, factType);
            
            // Step 5: Validate generated rule against metadata
            AIRuleValidationService.ValidationResult validation = 
                validationService.validateRule(generatedRule, factType);
            
            // Step 6: AI DRL Syntax Review - Review conditions for DRL compatibility
            List<String> drlWarnings = reviewDrlCompatibility(generatedRule, factType);
            if (!drlWarnings.isEmpty()) {
                validation.getWarnings().addAll(drlWarnings);
                log.warn("DRL compatibility warnings detected: {}", drlWarnings);
            }
            
            // Step 7: Build response
            responseBuilder
                .success(validation.isValid())
                .generatedRule(generatedRule)
                .aiExplanation(extractExplanation(aiResponse))
                .validation(AIGenerateRuleResponse.ValidationStatus.builder()
                    .valid(validation.isValid())
                    .errors(validation.getErrors())
                    .warnings(validation.getWarnings())
                    .autoCorrected(validation.getAutoCorrected())
                    .build());
            
            if (!validation.isValid()) {
                responseBuilder.suggestions(buildSuggestions(validation, metadata));
            }
            
            log.info("AI rule generation completed: valid={}, errors={}", 
                validation.isValid(), validation.getErrors().size());
            
        } catch (Exception e) {
            log.error("Error during AI rule generation", e);
            responseBuilder
                .success(false)
                .errorMessage("Failed to generate rule: " + e.getMessage())
                .suggestions(List.of(
                    "Please try rephrasing your request",
                    "Ensure your request clearly specifies conditions and outputs",
                    "Check that field names match available metadata"
                ));
        }
        
        return responseBuilder.build();
    }
    
    /**
     * Generate multiple rules using a single AI call. All requests must share the same fact type.
     * @param requests natural language requests (factType/additionalContext already normalized)
     * @param factType fact type to use for metadata/prompt
     * @param additionalContext optional shared context
     * @return list of responses mapped to input order
     */
    public List<AIGenerateRuleResponse> generateRulesSingleCall(
            List<AIGenerateRuleRequest> requests,
            String factType,
            String additionalContext) {
        
        List<AIGenerateRuleResponse> responses = new ArrayList<>();
        
        if (openAIClient == null || !openAIConfig.getEnabled()) {
            for (int i = 0; i < requests.size(); i++) {
                responses.add(AIGenerateRuleResponse.builder()
                    .success(false)
                    .errorMessage("AI features are disabled. Set AI_ENABLED=true and provide AI_API_KEY to use this feature.")
                    .suggestions(List.of(
                        "Set environment variable: AI_ENABLED=true",
                        "Set environment variable: AI_API_KEY=your-api-key",
                        "Optional: Set AI_PROVIDER=openrouter (default) or openai",
                        "Restart the application after setting environment variables"
                    ))
                    .build());
            }
            return responses;
        }
        
        try {
            RuleFieldMetadata metadata = getMetadata(factType);
            
            String prompt = buildBatchPrompt(requests, metadata, factType, additionalContext);
            log.info("AI batch prompt (factType={}, size={}): {}", factType, requests.size(), prompt);
            
            String aiResponse = callOpenAI(prompt);
            
            List<BatchRuleResult> batchResults = parseBatchAIResponse(aiResponse, factType);
            
            // Map results by index to preserve input order
            Map<Integer, BatchRuleResult> resultByIndex = new HashMap<>();
            for (BatchRuleResult r : batchResults) {
                if (r.getIndex() != null) {
                    resultByIndex.put(r.getIndex(), r);
                }
            }
            
            for (int i = 0; i < requests.size(); i++) {
                int idx = i + 1; // 1-based in prompt
                BatchRuleResult item = resultByIndex.get(idx);
                
                if (item == null) {
                    responses.add(AIGenerateRuleResponse.builder()
                        .success(false)
                        .errorMessage("No AI response for request index " + idx)
                        .build());
                    continue;
                }
                
                if (item.getError() != null && !item.getError().isBlank()) {
                    responses.add(AIGenerateRuleResponse.builder()
                        .success(false)
                        .errorMessage(item.getError())
                        .build());
                    continue;
                }
                
                if (item.getRule() == null) {
                    responses.add(AIGenerateRuleResponse.builder()
                        .success(false)
                        .errorMessage("AI did not return rule content for request index " + idx)
                        .build());
                    continue;
                }
                
                CreateRuleRequest generatedRule = item.getRule();
                if (generatedRule.getFactType() == null) {
                    generatedRule.setFactType(FactType.fromValue(factType));
                }
                
                AIRuleValidationService.ValidationResult validation =
                    validationService.validateRule(generatedRule, factType);
                
                List<String> drlWarnings = reviewDrlCompatibility(generatedRule, factType);
                if (!drlWarnings.isEmpty()) {
                    validation.getWarnings().addAll(drlWarnings);
                    log.warn("DRL compatibility warnings detected (batch index {}): {}", idx, drlWarnings);
                }
                
                AIGenerateRuleResponse.AIGenerateRuleResponseBuilder builder = AIGenerateRuleResponse.builder()
                    .success(validation.isValid())
                    .generatedRule(generatedRule)
                    .aiExplanation(item.getExplanation())
                    .validation(AIGenerateRuleResponse.ValidationStatus.builder()
                        .valid(validation.isValid())
                        .errors(validation.getErrors())
                        .warnings(validation.getWarnings())
                        .autoCorrected(validation.getAutoCorrected())
                        .build());
                
                if (!validation.isValid()) {
                    builder.suggestions(buildSuggestions(validation, metadata));
                }
                
                responses.add(builder.build());
            }
            
        } catch (Exception e) {
            log.error("Error during AI batch single-call generation", e);
            for (int i = 0; i < requests.size(); i++) {
                responses.add(AIGenerateRuleResponse.builder()
                    .success(false)
                    .errorMessage("Failed to generate batch rules: " + e.getMessage())
                    .suggestions(List.of(
                        "Please try rephrasing your request",
                        "Ensure your request clearly specifies conditions and outputs",
                        "Check that field names match available metadata"
                    ))
                    .build());
            }
        }
        
        return responses;
    }
    
    /**
     * Get metadata for specified fact type
     */
    private RuleFieldMetadata getMetadata(String factType) {
        List<FieldDefinition> inputFields = RuleFieldExtractor.extractInputFields(factType);
        List<FieldDefinition> outputFields = RuleFieldExtractor.extractOutputFields();
        Map<String, List<OperatorDefinition>> operatorsByType = RuleFieldExtractor.getOperatorsByType();
        
        return new RuleFieldMetadata(inputFields, outputFields, operatorsByType);
    }
    
    /**
     * Build batch prompt for multiple rules in one call.
     */
    private String buildBatchPrompt(
        List<AIGenerateRuleRequest> requests,
        RuleFieldMetadata metadata,
        String factType,
        String additionalContext
    ) throws JsonProcessingException {
        
        // Reduce metadata footprint: only names and operator strings
        Map<String, Object> metadataJson = new HashMap<>();
        metadataJson.put("inputFields", metadata.getInputFields()
            .stream()
            .map(FieldDefinition::getName)
            .toList());
        metadataJson.put("outputFields", metadata.getOutputFields()
            .stream()
            .map(FieldDefinition::getName)
            .toList());
        Map<String, List<String>> operatorsByType = new HashMap<>();
        metadata.getOperatorsByType().forEach((k, v) -> 
            operatorsByType.put(k, v.stream().map(OperatorDefinition::getOperator).toList()));
        metadataJson.put("operatorsByType", operatorsByType);
        
        String metadataJsonStr = objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(metadataJson);
        
        StringBuilder sb = new StringBuilder();
        sb.append("You are an expert Drools DRL rule generator for a customs declaration and cargo inspection system.\n");
        sb.append("Convert the following natural language rule descriptions into a JSON array of rules.\n");
        sb.append("IMPORTANT: All rules use fact type '").append(factType).append("'.\n");
        sb.append("Follow ALL constraints and output schema exactly. Return ONLY JSON, no markdown.\n\n");
        sb.append("AVAILABLE METADATA FOR FACT TYPE '").append(factType).append("':\n");
        sb.append(metadataJsonStr).append("\n\n");
        if (additionalContext != null && !additionalContext.isBlank()) {
            sb.append("ADDITIONAL CONTEXT (applies to ALL requests):\n");
            sb.append(additionalContext).append("\n\n");
        }
        sb.append("USER REQUESTS (may be in Vietnamese or English):\n");
        for (int i = 0; i < requests.size(); i++) {
            AIGenerateRuleRequest req = requests.get(i);
            sb.append(String.format("Request #%d: \"%s\"\n", i + 1, req.getNaturalLanguageInput()));
        }
        sb.append("\nOUTPUT FORMAT - Return ONLY this JSON structure:\n");
        sb.append("{\n");
        sb.append("  \"rules\": [\n");
        sb.append("    {\n");
        sb.append("      \"index\": 1,\n");
        sb.append("      \"explanation\": \"Brief explanation for request #1\",\n");
        sb.append("      \"rule\": {\n");
        sb.append("        \"ruleName\": \"Clear name\",\n");
        sb.append("        \"description\": \"Detailed description\",\n");
        sb.append("        \"factType\": \"").append(factType).append("\",\n");
        sb.append("        \"priority\": 100,\n");
        sb.append("        \"active\": false,\n");
        sb.append("        \"conditions\": {\"AND\": [{\"AND\": [{\"field\": \"...\", \"operator\": \"==\", \"value\": \"...\"}]}]},\n");
        sb.append("        \"output\": {\n");
        sb.append("          \"action\": \"FLAG|REVIEW|APPROVE|REJECT|HOLD\",\n");
        sb.append("          \"result\": \"Result message\",\n");
        sb.append("          \"score\": 50,\n");
        sb.append("          \"flag\": \"Optional flag\",\n");
        sb.append("          \"description\": \"Optional description\"\n");
        sb.append("        }\n");
        sb.append("      }\n");
        sb.append("    }\n");
        sb.append("  ]\n");
        sb.append("}\n\n");
        sb.append("CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:\n");
        sb.append("1. FIELD VALIDATION - MANDATORY:\n");
        sb.append("   - Use ONLY fields from the inputFields list in metadata - NO EXCEPTIONS\n");
        sb.append("   - Field names are CASE-SENSITIVE and must match EXACTLY (including entity prefix like 'traveler.', 'declaration.', 'cargoReport.')\n");
        sb.append("   - If a field mentioned by user does NOT exist in inputFields, REJECT the request - DO NOT try to find alternatives\n");
        sb.append("   - For Traveler fact type: There are NO HS code fields (no hscode, hsId, etc.) - if user requests HS code fields, REJECT it\n");
        sb.append("   - When rejecting: Set \"explanation\" to clearly state which field doesn't exist, set \"error\" field, and set \"rule\" to null\n");
        sb.append("2. OPERATOR VALIDATION:\n");
        sb.append("   - Use ONLY operators from metadata that are valid for each field's type\n");
        sb.append("3. CONDITION STRUCTURE:\n");
        sb.append("   - Conditions MUST be grouped by object path; never place conditions directly at top-level AND/OR\n");
        sb.append("4. LANGUAGE:\n");
        sb.append("   - Preserve user language (Vietnamese/English) in descriptions and outputs\n");
        sb.append("5. OUTPUT:\n");
        sb.append("   - Always return one rule object per input request, with matching \"index\" (1-based)\n");
        sb.append("   - If request cannot be fulfilled, return object with \"error\" field explaining why, and \"rule\" set to null\n");
        sb.append("6. FORMAT:\n");
        sb.append("   - Never include markdown or extra text, only JSON\n");
        
        return sb.toString();
    }
    
    /**
     * Build OpenAI prompt with metadata constraints
     */
    private String buildPrompt(
        AIGenerateRuleRequest request, 
        RuleFieldMetadata metadata,
        String factType
    ) throws JsonProcessingException {
        
        // Reduce metadata footprint: only names and operator strings to save tokens
        Map<String, Object> metadataJson = new HashMap<>();
        metadataJson.put("inputFields", metadata.getInputFields()
            .stream()
            .map(FieldDefinition::getName)
            .toList());
        metadataJson.put("outputFields", metadata.getOutputFields()
            .stream()
            .map(FieldDefinition::getName)
            .toList());
        Map<String, List<String>> operatorsByType = new HashMap<>();
        metadata.getOperatorsByType().forEach((k, v) -> 
            operatorsByType.put(k, v.stream().map(OperatorDefinition::getOperator).toList()));
        metadataJson.put("operatorsByType", operatorsByType);
        
        String metadataJsonStr = objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(metadataJson);
        
        return String.format("""
            You are an expert Drools DRL rule generator for a customs declaration and cargo inspection system.
            Your task is to convert natural language rule descriptions into structured JSON rules.
            
            IMPORTANT CONSTRAINTS - YOU MUST FOLLOW THESE STRICTLY:
            1. Use ONLY fields from the inputFields list below for conditions - NO EXCEPTIONS
            2. If a field mentioned by user does NOT exist in inputFields, REJECT the request - DO NOT try to find alternatives
            3. Field names are CASE-SENSITIVE and must match EXACTLY (including entity prefix like 'traveler.', 'declaration.', 'cargoReport.')
            4. All field paths must include the entity prefix (e.g., 'traveler.travelerId', 'declaration.invoiceAmount', 'cargoReport.reportId')
            5. Use ONLY operators that are valid for each field's type
            6. Use ONLY output fields from the outputFields list
            7. For Traveler fact type: There are NO HS code fields (no hscode, hsId, etc.) - if user requests HS code fields, REJECT it
            
            AVAILABLE METADATA FOR FACT TYPE '%s':
            %s
            
            USER REQUEST (may be in Vietnamese or English):
            "%s"
            
            %s
            
            OUTPUT FORMAT - Return ONLY valid JSON in this exact structure:
            {
              "explanation": "Brief explanation of how you interpreted the user's request",
              "rule": {
                "ruleName": "Clear, descriptive rule name",
                "description": "Detailed description of what this rule does",
                "factType": "%s",
                "priority": 100,
                "active": false,
                "conditions": null or {
                  "AND": [
                    {
                      "AND": [
                        {
                          "field": "declaration.field1",
                          "operator": "==",
                          "value": "value1"
                        },
                        {
                          "field": "declaration.field2",
                          "operator": ">",
                          "value": 100
                        }
                      ]
                    },
                    {
                      "AND": [
                        {
                          "field": "declaration.governmentAgencyGoodsItems.field3",
                          "operator": "==",
                          "value": "value3"
                        }
                      ]
                    }
                  ],
                  "OR": [
                    {
                      "OR": [
                        {
                          "field": "declaration.field1",
                          "operator": "==",
                          "value": "value1"
                        },
                        {
                          "field": "declaration.field2",
                          "operator": ">",
                          "value": 100
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "REQUIRED - one of: FLAG, REVIEW, APPROVE, REJECT, HOLD",
                  "result": "REQUIRED - result message/description",
                  "score": 50,
                  "flag": "Optional flag category (e.g., HIGH_RISK, SUSPICIOUS)",
                  "description": "Optional detailed description"
                }
              }
            }
            
            CRITICAL CONDITIONS STRUCTURE RULES - GROUP BY OBJECT PATH:
            - Conditions MUST be grouped by object path (the part before the last dot in field path)
            - Object path examples: "declaration" for "declaration.invoiceAmount", "declaration.governmentAgencyGoodsItems" for "declaration.governmentAgencyGoodsItems.hsId"
            - Conditions with the SAME object path go in the SAME nested group
            - Conditions with DIFFERENT object paths go in DIFFERENT nested groups
            - Top-level AND/OR array contains nested group objects, each nested group has "AND" or "OR" key
            - Each nested group contains condition objects: {"field": "...", "operator": "...", "value": "..."}
            - If user specifies ONLY 1 condition: wrap in nested AND group: {"AND": [{"AND": [condition]}]}
            - If user specifies 2+ conditions with same object path: {"AND": [{"AND": [condition1, condition2, ...]}]}
            - If user specifies 2+ conditions with different object paths: {"AND": [{"AND": [condition1]}, {"AND": [condition2]}]}
            - NEVER put conditions directly in top-level AND/OR arrays - always wrap them in nested groups by object path
            
            EXAMPLES:
            
            Example 1 - User says: "If HS code is 610910 then score is 80 and action is REVIEW"
            (Single condition - wrap in nested AND group)
            {
              "explanation": "User wants to review items with HS code 610910 and assign a score of 80",
              "rule": {
                "ruleName": "Review HS Code 610910",
                "description": "This rule flags items with HS code 610910 for review with a risk score of 80",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": {
                  "AND": [
                    {
                      "AND": [
                        {
                          "field": "declaration.governmentAgencyGoodsItems.hsId",
                          "operator": "==",
                          "value": "610910"
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "REVIEW",
                  "result": "Flagged for review - HS code 610910 detected",
                  "score": 80,
                  "flag": "HS_CODE_REVIEW"
                }
              }
            }
            
            Example 2 - User says: "If total gross mass > 1000kg then require inspection"
            (Single condition - wrap in nested AND group)
            {
              "explanation": "User wants to require inspection for heavy cargo over 1000kg",
              "rule": {
                "ruleName": "Heavy Cargo Inspection",
                "description": "Require inspection for declarations with total gross mass exceeding 1000kg",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": {
                  "AND": [
                    {
                      "AND": [
                        {
                          "field": "declaration.totalGrossMassMeasure",
                          "operator": ">",
                          "value": 1000
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "FLAG",
                  "result": "Inspection required - cargo weight exceeds 1000kg",
                  "score": 70,
                  "flag": "HEAVY_CARGO"
                }
              }
            }
            
            Example 3 - User says: "If originCountryId equals CN or dutyRate is greater than 15, then set score to 85"
            (Two OR conditions with same object path - wrap in nested OR group)
            {
              "explanation": "User wants to flag items with origin country CN OR duty rate > 15",
              "rule": {
                "ruleName": "High Risk Origin or Duty Rate",
                "description": "Flag items from China or with high duty rate",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": {
                  "OR": [
                    {
                      "OR": [
                        {
                          "field": "declaration.governmentAgencyGoodsItems.originCountryId",
                          "operator": "==",
                          "value": "CN"
                        },
                        {
                          "field": "declaration.governmentAgencyGoodsItems.dutyRate",
                          "operator": ">",
                          "value": 15
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "REVIEW",
                  "result": "High risk item detected - origin country CN or duty rate > 15",
                  "score": 85
                }
              }
            }
            
            Example 4 - User says: "If invoiceAmount > 150000 and countryOfExportId equals CN, then set score to 90"
            (Two AND conditions with same object path - wrap in nested AND group)
            {
              "explanation": "User wants to flag high-value imports from China",
              "rule": {
                "ruleName": "High Value Import from China",
                "description": "Flag declarations with invoice amount > 150000 and country of export CN",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": {
                  "AND": [
                    {
                      "AND": [
                        {
                          "field": "declaration.invoiceAmount",
                          "operator": ">",
                          "value": 150000
                        },
                        {
                          "field": "declaration.countryOfExportId",
                          "operator": "==",
                          "value": "CN"
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "REVIEW",
                  "result": "High value import from China detected",
                  "score": 90,
                  "flag": "HIGH_RISK"
                }
              }
            }
            
            Example 5 - User says: "If totalFreightAmount is greater than 10000 and totalInsuranceAmount is greater than 2000 and goods item has hsId equals 610910, then set score to 80 and flag as HIGH_FREIGHT_COST"
            (Three AND conditions with DIFFERENT object paths - group by object path)
            Note: totalFreightAmount and totalInsuranceAmount have object path "declaration"
            Note: governmentAgencyGoodsItems.hsId has object path "declaration.governmentAgencyGoodsItems"
            {
              "explanation": "User wants to flag declarations with high freight and insurance costs for specific HS code",
              "rule": {
                "ruleName": "High Freight Cost for HS Code 610910",
                "description": "Flag declarations with totalFreightAmount > 10000, totalInsuranceAmount > 2000, and HS code 610910",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": {
                  "AND": [
                    {
                      "AND": [
                        {
                          "field": "declaration.totalFreightAmount",
                          "operator": ">",
                          "value": 10000
                        },
                        {
                          "field": "declaration.totalInsuranceAmount",
                          "operator": ">",
                          "value": 2000
                        }
                      ]
                    },
                    {
                      "AND": [
                        {
                          "field": "declaration.governmentAgencyGoodsItems.hsId",
                          "operator": "==",
                          "value": "610910"
                        }
                      ]
                    }
                  ]
                },
                "output": {
                  "action": "REVIEW",
                  "result": "High freight cost detected for HS code 610910",
                  "score": 80,
                  "flag": "HIGH_FREIGHT_COST"
                }
              }
            }
            
            CRITICAL VALIDATION RULES - YOU MUST FOLLOW THESE STRICTLY:
            
            1. FIELD VALIDATION - MANDATORY:
               - Use ONLY fields from the inputFields list provided above
               - Field names are CASE-SENSITIVE and must match EXACTLY (including entity prefix like "traveler.", "declaration.", "cargoReport.")
               - If the user mentions a field that does NOT exist in inputFields, you MUST REJECT the request
               - DO NOT try to find "closest matching" fields - this leads to incorrect rules
               - DO NOT create rules with invalid fields - return an error explanation instead
               - Example: If user says "hscode" for Traveler fact type, but Traveler has NO hscode field, you MUST reject it
               - When rejecting: Set "explanation" to clearly state which field doesn't exist and why the rule cannot be created
               - Return the JSON structure with "explanation" explaining the error, but set conditions to null or empty
            
            2. FACT TYPE SPECIFIC CONSTRAINTS:
               - For Traveler fact type: There is NO hscode, hsId, or any HS code related fields
               - For Traveler fact type: Available fields include travelerId, sequenceNumeric, crewOrPassengerCode, nationalityCountryId, etc.
               - For Declaration fact type: HS code fields are in nested path: declaration.governmentAgencyGoodsItems.hsId
               - For CargoReport fact type: Different field structure - check inputFields list
            
            3. OPERATOR VALIDATION:
               - Ensure operators match field types (e.g., don't use "contains" on numeric fields)
               - Use only operators from the operatorsByType map for each field's type
            
            4. OUTPUT VALIDATION:
               - Score should typically be between 0-100
               - At least one output field (action, result, score, etc.) must be specified
            
            5. CONDITION STRUCTURE:
               - ALWAYS group conditions by object path - conditions with same object path go in same nested group
               - NEVER put conditions directly in top-level AND/OR arrays - always wrap them in nested groups by object path
               - To determine object path: take all parts of field path except the last part (the actual field name)
               - Example: "declaration.invoiceAmount" -> object path "declaration"
               - Example: "declaration.governmentAgencyGoodsItems.hsId" -> object path "declaration.governmentAgencyGoodsItems"
            
            6. LANGUAGE PRESERVATION:
               - Preserve the user's language (Vietnamese/English) in description and result fields
            
            7. ERROR HANDLING:
               - If user's request cannot be fulfilled due to invalid fields, return JSON with:
                 - "explanation": Clear error message explaining which field is invalid and what fields are available
                 - "rule": Structure with null or empty conditions, but valid factType
               - Example error explanation: "Cannot create rule: Field 'hscode' does not exist for Traveler fact type. Available fields include: travelerId, sequenceNumeric, crewOrPassengerCode, nationalityCountryId, etc. Traveler entity does not have HS code fields."
            
            IMPORTANT: Return ONLY the JSON structure above. Do not include any markdown, code blocks, or additional text.
            """,
            factType,
            metadataJsonStr,
            request.getNaturalLanguageInput(),
            request.getAdditionalContext() != null ? "ADDITIONAL CONTEXT:\n" + request.getAdditionalContext() : "",
            factType
        );
    }
    
    /**
     * Call AI API (OpenRouter or OpenAI) to generate rule
     */
    private String callOpenAI(String prompt) {
        try {
            log.debug("Calling AI API (provider: {}) with model: {}", 
                openAIConfig.getProvider(), openAIConfig.getModel());
            
            ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(openAIConfig.getModel())
                .addUserMessage(prompt)
                .temperature(openAIConfig.getTemperature())
                .build();
            
            ChatCompletion completion = openAIClient.chat().completions().create(params);
            
            String response = completion.choices().get(0).message().content().orElse("");
            log.debug("AI API response received: {} characters", response.length());
            
            return response;
            
        } catch (Exception e) {
            try {
                // Log comprehensive error details
                log.error("=== AI API CALL FAILED ===");
                log.error("Provider: {}", openAIConfig != null ? openAIConfig.getProvider() : "null");
                log.error("Model: {}", openAIConfig != null ? openAIConfig.getModel() : "null");
                log.error("Timeout configured: {} seconds", openAIConfig != null ? openAIConfig.getTimeout() : "null");
                log.error("Prompt length: {} chars", prompt != null ? prompt.length() : 0);
                log.error("Temperature: {}", openAIConfig != null ? openAIConfig.getTemperature() : "null");
                log.error("Max tokens: {}", openAIConfig != null ? openAIConfig.getMaxTokens() : "null");
                log.error("Exception type: {}", e.getClass().getName());
                log.error("Exception message: {}", e.getMessage());
                
                // Log exception chain in detail with stack traces
                Throwable cause = e;
                int depth = 0;
                while (cause != null && depth < 5) {
                    String className = cause.getClass().getName();
                    log.error("Exception chain [depth {}]: {} - {}", depth, className, cause.getMessage());
                    if (cause instanceof java.io.InterruptedIOException) {
                        log.error("  -> This is a TIMEOUT exception - API call exceeded {} seconds", 
                            openAIConfig != null ? openAIConfig.getTimeout() : "unknown");
                    }
                    if (className.contains("StreamResetException") || className.contains("http2")) {
                        log.error("  -> HTTP/2 stream was reset (connection may have been cancelled)");
                    }
                    // Log stack trace for this level of exception
                    if (cause.getStackTrace() != null && cause.getStackTrace().length > 0) {
                        log.error("  Stack trace [depth {}]:", depth);
                        StackTraceElement[] stackTrace = cause.getStackTrace();
                        int maxLines = Math.min(10, stackTrace.length); // Log first 10 lines
                        for (int i = 0; i < maxLines; i++) {
                            log.error("    at {}", stackTrace[i]);
                        }
                        if (stackTrace.length > maxLines) {
                            log.error("    ... ({} more lines)", stackTrace.length - maxLines);
                        }
                    }
                    cause = cause.getCause();
                    depth++;
                }
                
                // Log prompt preview (first 500 chars) for debugging
                if (prompt != null && prompt.length() > 0) {
                    String promptPreview = prompt.length() > 500 
                        ? prompt.substring(0, 500) + "..." 
                        : prompt;
                    log.error("Prompt preview (first 500 chars): {}", promptPreview);
                }
                
                // Check if this is a timeout issue and suggest solution
                if (e.getCause() instanceof java.io.InterruptedIOException) {
                    log.error("=== TIMEOUT DETECTED ===");
                    log.error("The API call timed out after {} seconds. Possible solutions:", 
                        openAIConfig != null ? openAIConfig.getTimeout() : "unknown");
                    log.error("1. Increase timeout in application.yml: ai.timeout=<higher_value> (e.g., 60 or 120)");
                    log.error("2. Reduce batch size (fewer rules per request)");
                    log.error("3. Use a faster model");
                    log.error("4. Check network connectivity to {}", 
                        openAIConfig != null && openAIConfig.getProvider() != null && openAIConfig.getProvider().equals("openrouter") 
                            ? "openrouter.ai" : "api.openai.com");
                }
                
                log.error("=== END ERROR DETAILS ===");
                
                // Log full stack trace - MUST be logged before throwing
                log.error("=== FULL STACK TRACE ===");
                log.error("Complete exception stack trace:", e);
                
            } catch (Exception logException) {
                // If logging fails, at least try to log the original exception
                System.err.println("CRITICAL: Failed to log exception details. Original exception:");
                e.printStackTrace();
                System.err.println("Logging exception:");
                logException.printStackTrace();
            }
            
            throw new RuntimeException("Failed to call AI API: " + e.getMessage(), e);
        }
    }
    
    /**
     * Parse AI batch response into individual rules.
     */
    private List<BatchRuleResult> parseBatchAIResponse(String aiResponse, String factType) {
        List<BatchRuleResult> results = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(aiResponse);
            JsonNode rulesNode = root.has("rules") ? root.get("rules") : root;
            if (rulesNode == null || !rulesNode.isArray()) {
                throw new IllegalArgumentException("Batch AI response missing 'rules' array");
            }
            
            for (JsonNode node : rulesNode) {
                BatchRuleResult result = new BatchRuleResult();
                if (node.has("index") && node.get("index").canConvertToInt()) {
                    result.setIndex(node.get("index").asInt());
                }
                if (node.has("explanation")) {
                    result.setExplanation(node.get("explanation").asText());
                }
                if (node.has("error")) {
                    result.setError(node.get("error").asText());
                }
                if (node.has("rule") && !node.get("rule").isNull()) {
                    CreateRuleRequest rule = objectMapper.treeToValue(node.get("rule"), CreateRuleRequest.class);
                    if (rule.getFactType() == null) {
                        rule.setFactType(FactType.fromValue(factType));
                    }
                    result.setRule(rule);
                }
                results.add(result);
            }
            
            return results;
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse batch AI response: " + e.getMessage(), e);
        }
    }
    
    /**
     * Parse AI response JSON to CreateRuleRequest object
     */
    private CreateRuleRequest parseAIResponse(String aiResponse, String factType) throws JsonProcessingException {
        try {
            // Clean up response (remove markdown code blocks if present)
            String cleanedResponse = aiResponse.trim();
            if (cleanedResponse.startsWith("```json")) {
                cleanedResponse = cleanedResponse.substring(7);
            }
            if (cleanedResponse.startsWith("```")) {
                cleanedResponse = cleanedResponse.substring(3);
            }
            if (cleanedResponse.endsWith("```")) {
                cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length() - 3);
            }
            cleanedResponse = cleanedResponse.trim();
            
            // Parse outer wrapper with explanation
            @SuppressWarnings("unchecked")
            Map<String, Object> wrapper = objectMapper.readValue(cleanedResponse, Map.class);
            
            // Extract the rule object
            Object ruleObj = wrapper.get("rule");
            if (ruleObj == null) {
                // If no wrapper, try parsing directly as rule
                return objectMapper.readValue(cleanedResponse, CreateRuleRequest.class);
            }
            
            // Convert rule object to CreateRuleRequest
            String ruleJson = objectMapper.writeValueAsString(ruleObj);
            CreateRuleRequest rule = objectMapper.readValue(ruleJson, CreateRuleRequest.class);
            
            // Ensure fact type is set
            if (rule.getFactType() == null) {
                rule.setFactType(FactType.fromValue(factType));
            }
            
            // Mark as AI-generated
            rule.setGeneratedByAi(true);
            
            return rule;
            
        } catch (Exception e) {
            log.error("Error parsing AI response: {}", aiResponse, e);
            throw new RuntimeException("Failed to parse AI response: " + e.getMessage(), e);
        }
    }
    
    /**
     * Extract explanation from AI response
     */
    private String extractExplanation(String aiResponse) {
        try {
            String cleaned = aiResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("```(json)?\\s*", "").replaceAll("```$", "").trim();
            }
            
            @SuppressWarnings("unchecked")
            Map<String, Object> wrapper = objectMapper.readValue(cleaned, Map.class);
            Object explanation = wrapper.get("explanation");
            
            return explanation != null ? explanation.toString() : 
                "Rule generated from natural language input";
                
        } catch (Exception e) {
            return "Rule generated from natural language input";
        }
    }
    
    /**
     * Minimal DTO for parsing batch AI responses.
     */
    private static class BatchRuleResult {
        private Integer index;
        private String explanation;
        private String error;
        private CreateRuleRequest rule;
        
        public Integer getIndex() {
            return index;
        }
        
        public void setIndex(Integer index) {
            this.index = index;
        }
        
        public String getExplanation() {
            return explanation;
        }
        
        public void setExplanation(String explanation) {
            this.explanation = explanation;
        }
        
        public String getError() {
            return error;
        }
        
        public void setError(String error) {
            this.error = error;
        }
        
        public CreateRuleRequest getRule() {
            return rule;
        }
        
        public void setRule(CreateRuleRequest rule) {
            this.rule = rule;
        }
    }
    
    /**
     * Build helpful suggestions based on validation errors
     */
    private List<String> buildSuggestions(
        AIRuleValidationService.ValidationResult validation,
        RuleFieldMetadata metadata
    ) {
        List<String> suggestions = new ArrayList<>();
        
        for (String error : validation.getErrors()) {
            if (error.contains("does not exist")) {
                suggestions.add("Check available fields using GET /api/v1/rules/metadata?factType=<type>");
            } else if (error.contains("not valid for field type")) {
                suggestions.add("Ensure operators match field types (e.g., use '>' for numbers, 'contains' for strings)");
            } else if (error.contains("required")) {
                suggestions.add("Ensure all required fields are provided (field, operator, value for conditions)");
            }
        }
        
        if (suggestions.isEmpty()) {
            suggestions.add("Review the metadata endpoint to see available fields and operators");
            suggestions.add("Try rephrasing your request with more specific field names");
        }
        
        return suggestions;
    }
    
    /**
     * AI-powered DRL syntax review.
     * Reviews conditions and output for Drools DRL compatibility issues.
     * Detects unsupported operations like "divided by", "multiplied by", etc.
     * 
     * @param rule The generated rule to review
     * @param factType The fact type
     * @return List of DRL compatibility warnings
     */
    private List<String> reviewDrlCompatibility(CreateRuleRequest rule, String factType) {
        List<String> warnings = new ArrayList<>();
        
        // Check if AI is enabled
        if (openAIClient == null || !openAIConfig.getEnabled()) {
            return warnings; // Skip review if AI is disabled
        }
        
        try {
            // Build review prompt
            String reviewPrompt = buildDrlReviewPrompt(rule, factType);
            
            // Call AI API for review
            String reviewResponse = callOpenAIForReview(reviewPrompt);
            
            // Parse review response
            List<String> aiWarnings = parseReviewResponse(reviewResponse);
            warnings.addAll(aiWarnings);
            
            log.debug("DRL review completed: {} warnings found", warnings.size());
            
        } catch (Exception e) {
            log.warn("Failed to perform AI DRL review: {}", e.getMessage());
            // Don't fail the whole generation if review fails
        }
        
        return warnings;
    }
    
    /**
     * Build prompt for DRL syntax review
     */
    private String buildDrlReviewPrompt(CreateRuleRequest rule, String factType) throws JsonProcessingException {
        // Convert rule to JSON for review
        Map<String, Object> ruleJson = new HashMap<>();
        ruleJson.put("ruleName", rule.getRuleName());
        ruleJson.put("factType", factType);
        ruleJson.put("conditions", rule.getConditions());
        ruleJson.put("output", rule.getOutput());
        
        String ruleJsonStr = objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(ruleJson);
        
        return String.format("""
            You are a Drools DRL syntax expert. Review the following rule conditions and output for DRL compatibility.
            
            IMPORTANT: Drools DRL does NOT support:
            1. Mathematical operations in conditions (e.g., "divided by", "multiplied by", "plus", "minus")
            2. Complex calculations in WHEN clause (e.g., "field1 / field2", "field1 + field2")
            3. Nested arithmetic expressions
            
            RULE TO REVIEW:
            %s
            
            TASK:
            Analyze the conditions array and identify any that would cause DRL compilation errors.
            Common issues:
            - Conditions that require arithmetic operations (division, multiplication, addition, subtraction)
            - Conditions comparing calculated values (e.g., "field1 / field2 < 10")
            - Conditions with complex expressions
            
            OUTPUT FORMAT - Return ONLY valid JSON:
            {
              "hasIssues": true/false,
              "warnings": [
                "Warning message 1",
                "Warning message 2"
              ],
              "suggestions": [
                "Suggestion 1",
                "Suggestion 2"
              ]
            }
            
            If no issues found, return:
            {
              "hasIssues": false,
              "warnings": [],
              "suggestions": []
            }
            
            IMPORTANT: Return ONLY the JSON structure. Do not include markdown or additional text.
            """,
            ruleJsonStr
        );
    }
    
    /**
     * Call AI API for DRL review (with lower temperature for more consistent results)
     */
    private String callOpenAIForReview(String prompt) {
        try {
            log.debug("Calling AI API for DRL review (provider: {})", openAIConfig.getProvider());
            
            ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(openAIConfig.getModel())
                .addUserMessage(prompt)
                .temperature(0.1) // Lower temperature for more consistent review
                .build();
            
            ChatCompletion completion = openAIClient.chat().completions().create(params);
            
            String response = completion.choices().get(0).message().content().orElse("");
            log.debug("DRL review response received: {} characters", response.length());
            
            return response;
            
        } catch (Exception e) {
            log.error("Error calling AI API for DRL review (provider: {})", 
                openAIConfig.getProvider(), e);
            throw new RuntimeException("Failed to call AI API for review: " + e.getMessage(), e);
        }
    }
    
    /**
     * Parse AI review response and extract warnings
     */
    @SuppressWarnings("unchecked")
    private List<String> parseReviewResponse(String reviewResponse) {
        List<String> warnings = new ArrayList<>();
        
        try {
            // Clean up response
            String cleaned = reviewResponse.trim();
            if (cleaned.startsWith("```json")) {
                cleaned = cleaned.substring(7);
            }
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.substring(3);
            }
            if (cleaned.endsWith("```")) {
                cleaned = cleaned.substring(0, cleaned.length() - 3);
            }
            cleaned = cleaned.trim();
            
            // Parse JSON
            Map<String, Object> review = objectMapper.readValue(cleaned, Map.class);
            
            Boolean hasIssues = (Boolean) review.get("hasIssues");
            if (hasIssues != null && hasIssues) {
                List<String> warningList = (List<String>) review.get("warnings");
                if (warningList != null) {
                    warnings.addAll(warningList);
                }
                
                List<String> suggestions = (List<String>) review.get("suggestions");
                if (suggestions != null && !suggestions.isEmpty()) {
                    warnings.add("Suggestions: " + String.join("; ", suggestions));
                }
            }
            
        } catch (Exception e) {
            log.warn("Failed to parse DRL review response: {}", e.getMessage());
            // Don't fail if parsing fails
        }
        
        return warnings;
    }
}

