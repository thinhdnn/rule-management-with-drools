package rule.engine.org.app.domain.entity.execution.traveler;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Traveler entity following WCO Data Model 3.9
 * Represents a passenger or crew member traveling on a vessel/aircraft
 */
@Entity
@Table(name = "travelers")
@Data
@EqualsAndHashCode(callSuper = true)
public class Traveler extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Unique identifier for the traveler (e.g., "TRAVELER-2025-0001")
    @Column(name = "traveler_id", unique = true)
    private String travelerId;

    // Sequence and basic classification
    @Column(name = "sequence_numeric")
    private Integer sequenceNumeric;

    @Column(name = "crew_or_passenger_code")
    private String crewOrPassengerCode; // PAX or CREW

    @Column(name = "residence_status_code")
    private String residenceStatusCode; // R = Resident, V = Visitor

    @Column(name = "transit_indicator_code")
    private String transitIndicatorCode; // Y or N

    @Column(name = "inadmissible_indicator_code")
    private String inadmissibleIndicatorCode; // Y or N (INAD case)

    @Column(name = "death_indicator_code")
    private String deathIndicatorCode; // Y or N (Death on board)

    @Column(name = "deportee_indicator_code")
    private String deporteeIndicatorCode; // Y or N (DEPA/DEPU)

    @Column(name = "unaccompanied_minor_indicator_code")
    private String unaccompaniedMinorIndicatorCode; // Y or N

    // Personal information
    @Column(name = "family_name")
    private String familyName;

    @Column(name = "given_name")
    private String givenName;

    @Column(name = "middle_name")
    private String middleName;

    @Column(name = "other_given_names", columnDefinition = "TEXT")
    private String otherGivenNames; // JSON array stored as string

    @Column(name = "gender_code")
    private String genderCode; // M, F, etc.

    @Column(name = "birth_date")
    private LocalDate birthDate;

    // Country information
    @Column(name = "birth_country_id")
    private String birthCountryId;

    @Column(name = "nationality_country_id")
    private String nationalityCountryId;

    @Column(name = "second_nationality_country_id")
    private String secondNationalityCountryId;

    @Column(name = "residence_country_id")
    private String residenceCountryId;

    // Contact information
    @Column(name = "address_in_destination_text", columnDefinition = "TEXT")
    private String addressInDestinationText;

    @Column(name = "contact_phone_number")
    private String contactPhoneNumber;

    @Column(name = "email_address_id")
    private String emailAddressId;

    // Travel document
    @Column(name = "travel_document_type_code")
    private String travelDocumentTypeCode; // P = Passport, etc.

    @Column(name = "travel_document_number")
    private String travelDocumentNumber;

    @Column(name = "travel_document_issuing_country_id")
    private String travelDocumentIssuingCountryId;

    @Column(name = "travel_document_issue_date")
    private LocalDate travelDocumentIssueDate;

    @Column(name = "travel_document_expiry_date")
    private LocalDate travelDocumentExpiryDate;

    @Column(name = "travel_document_other_id")
    private String travelDocumentOtherId; // For non-passport ID types

    // Visa information
    @Column(name = "visa_id")
    private String visaId;

    @Column(name = "visa_expiry_date")
    private LocalDate visaExpiryDate;

    @Column(name = "visa_issue_country_id")
    private String visaIssueCountryId;

    @Column(name = "visa_type_code")
    private String visaTypeCode; // T = Tourist, W = Work, S = Student, etc.

    // Embarkation/Disembarkation
    @Column(name = "embarkation_location_id")
    private String embarkationLocationId; // UN/LOCODE

    @Column(name = "disembarkation_location_id")
    private String disembarkationLocationId;

    @Column(name = "embarkation_date_time")
    private LocalDateTime embarkationDateTime;

    @Column(name = "disembarkation_date_time")
    private LocalDateTime disembarkationDateTime;

    // Transportation details
    @Column(name = "transportation_class_code")
    private String transportationClassCode; // ECO = Economy, BUS = Business, etc.

    @Column(name = "seat_or_cabin_id")
    private String seatOrCabinId;

    // Baggage information
    @Column(name = "baggage_count")
    private Integer baggageCount;

    @Column(name = "baggage_weight_measure")
    private java.math.BigDecimal baggageWeightMeasure;

    @Column(name = "baggage_tag_ids", columnDefinition = "TEXT")
    private String baggageTagIds; // JSON array stored as string

    // PNR (Passenger Name Record)
    @Column(name = "pnr_record_locator_id")
    private String pnrRecordLocatorId;

    @Column(name = "pnr_creation_date_time")
    private LocalDateTime pnrCreationDateTime;

    // Carrier information
    @Column(name = "carrier_code")
    private String carrierCode;

    @Column(name = "carrier_name")
    private String carrierName;

    // Emergency contact
    @Column(name = "emergency_contact_name")
    private String emergencyContactName;

    @Column(name = "emergency_contact_phone_number")
    private String emergencyContactPhoneNumber;

    @Column(name = "emergency_contact_relationship_code")
    private String emergencyContactRelationshipCode;

    // Relationship to itinerary legs
    @OneToMany(mappedBy = "traveler", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItineraryLeg> itineraryLegs = new ArrayList<>();
}

