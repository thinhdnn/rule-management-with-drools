package rule.engine.org.app.domain.entity.execution.traveler;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;
import java.time.LocalDateTime;

/**
 * Itinerary Leg entity
 * Represents a single leg of a traveler's journey
 * Part of Traveler
 */
@Entity
@Table(name = "itinerary_legs")
@Data
@EqualsAndHashCode(callSuper = true)
public class ItineraryLeg extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "traveler_id", nullable = false)
    private Traveler traveler;

    @Column(name = "leg_sequence_numeric")
    private Integer legSequenceNumeric;

    @Column(name = "departure_location_id")
    private String departureLocationId; // UN/LOCODE

    @Column(name = "arrival_location_id")
    private String arrivalLocationId; // UN/LOCODE

    @Column(name = "departure_date_time")
    private LocalDateTime departureDateTime;

    @Column(name = "arrival_date_time")
    private LocalDateTime arrivalDateTime;

    @Column(name = "transport_means_id")
    private String transportMeansId; // IMO, Flight number, etc.
}

