package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class FactTypeConverter implements AttributeConverter<FactType, String> {
    
    @Override
    public String convertToDatabaseColumn(FactType attribute) {
        if (attribute == null) {
            return null;
        }
        return attribute.getValue();
    }
    
    @Override
    public FactType convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        return FactType.fromValue(dbData);
    }
}
