package rule.engine.org.app.domain.service;

import com.fasterxml.jackson.core.JsonProcessingException;
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
 * Service for generating rules from natural language input using OpenAI GPT.
 * This service:
 * 1. Loads metadata constraints (available fields, operators, outputs)
 * 2. Builds a structured prompt with metadata
 * 3. Calls OpenAI API to generate rule JSON
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
                .errorMessage("AI features are disabled. Set OPENAI_ENABLED=true and provide OPENAI_API_KEY to use this feature.")
                .suggestions(List.of(
                    "Set environment variable: OPENAI_ENABLED=true",
                    "Set environment variable: OPENAI_API_KEY=your-api-key",
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
            
            // Step 3: Call OpenAI API
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
     * Get metadata for specified fact type
     */
    private RuleFieldMetadata getMetadata(String factType) {
        List<FieldDefinition> inputFields = RuleFieldExtractor.extractInputFields(factType);
        List<FieldDefinition> outputFields = RuleFieldExtractor.extractOutputFields();
        Map<String, List<OperatorDefinition>> operatorsByType = RuleFieldExtractor.getOperatorsByType();
        
        return new RuleFieldMetadata(inputFields, outputFields, operatorsByType);
    }
    
    /**
     * Build OpenAI prompt with metadata constraints
     */
    private String buildPrompt(
        AIGenerateRuleRequest request, 
        RuleFieldMetadata metadata,
        String factType
    ) throws JsonProcessingException {
        
        // Convert metadata to JSON for inclusion in prompt
        Map<String, Object> metadataJson = new HashMap<>();
        metadataJson.put("inputFields", metadata.getInputFields());
        metadataJson.put("outputFields", metadata.getOutputFields());
        metadataJson.put("operatorsByType", metadata.getOperatorsByType());
        
        String metadataJsonStr = objectMapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(metadataJson);
        
        return String.format("""
            You are an expert Drools DRL rule generator for a customs declaration and cargo inspection system.
            Your task is to convert natural language rule descriptions into structured JSON rules.
            
            IMPORTANT CONSTRAINTS - YOU MUST FOLLOW THESE STRICTLY:
            1. Use ONLY fields from the inputFields list below for conditions
            2. Use ONLY operators that are valid for each field's type
            3. Use ONLY output fields from the outputFields list
            4. Field names are CASE-SENSITIVE and must match EXACTLY
            5. All field paths must include the entity prefix (e.g., 'declaration.fieldName' or 'cargoReport.fieldName')
            
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
                "conditions": [
                  {
                    "field": "MUST be from inputFields list",
                    "operator": "MUST be valid for field type",
                    "value": "Value to compare against"
                  }
                ],
                "output": {
                  "action": "REQUIRED - one of: FLAG, REVIEW, APPROVE, REJECT, HOLD",
                  "result": "REQUIRED - result message/description",
                  "score": 50,
                  "flag": "Optional flag category (e.g., HIGH_RISK, SUSPICIOUS)",
                  "description": "Optional detailed description"
                }
              }
            }
            
            EXAMPLES:
            
            Example 1 - User says: "If HS code is 610910 then score is 80 and action is REVIEW"
            {
              "explanation": "User wants to review items with HS code 610910 and assign a score of 80",
              "rule": {
                "ruleName": "Review HS Code 610910",
                "description": "This rule flags items with HS code 610910 for review with a risk score of 80",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": [
                  {
                    "field": "declaration.governmentAgencyGoodsItems.hsId",
                    "operator": "==",
                    "value": "610910"
                  }
                ],
                "output": {
                  "action": "REVIEW",
                  "result": "Flagged for review - HS code 610910 detected",
                  "score": 80,
                  "flag": "HS_CODE_REVIEW"
                }
              }
            }
            
            Example 2 - User says: "If total gross mass > 1000kg then require inspection"
            {
              "explanation": "User wants to require inspection for heavy cargo over 1000kg",
              "rule": {
                "ruleName": "Heavy Cargo Inspection",
                "description": "Require inspection for declarations with total gross mass exceeding 1000kg",
                "factType": "Declaration",
                "priority": 100,
                "active": false,
                "conditions": [
                  {
                    "field": "declaration.totalGrossMassMeasure",
                    "operator": ">",
                    "value": 1000
                  }
                ],
                "output": {
                  "action": "FLAG",
                  "result": "Inspection required - cargo weight exceeds 1000kg",
                  "score": 70,
                  "flag": "HEAVY_CARGO"
                }
              }
            }
            
            VALIDATION RULES:
            - If the user mentions a field that doesn't exist, find the closest matching field from inputFields
            - If the user's intent is unclear, make reasonable assumptions but explain them in "explanation"
            - Ensure operators match field types (e.g., don't use "contains" on numeric fields)
            - Score should typically be between 0-100
            - At least one condition and one output are required
            - Preserve the user's language (Vietnamese/English) in description and result fields
            
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
     * Call OpenAI API to generate rule
     */
    private String callOpenAI(String prompt) {
        try {
            log.debug("Calling OpenAI API with model: {}", openAIConfig.getModel());
            
            ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(openAIConfig.getModel())
                .addUserMessage(prompt)
                .temperature(openAIConfig.getTemperature())
                .build();
            
            ChatCompletion completion = openAIClient.chat().completions().create(params);
            
            String response = completion.choices().get(0).message().content().orElse("");
            log.debug("OpenAI response received: {} characters", response.length());
            
            return response;
            
        } catch (Exception e) {
            log.error("Error calling OpenAI API", e);
            throw new RuntimeException("Failed to call OpenAI API: " + e.getMessage(), e);
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
            
            // Call OpenAI for review
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
     * Call OpenAI API for DRL review (with lower temperature for more consistent results)
     */
    private String callOpenAIForReview(String prompt) {
        try {
            log.debug("Calling OpenAI API for DRL review");
            
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
            log.error("Error calling OpenAI API for DRL review", e);
            throw new RuntimeException("Failed to call OpenAI API for review: " + e.getMessage(), e);
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

