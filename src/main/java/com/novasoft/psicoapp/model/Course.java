package com.novasoft.psicoapp.model; import jakarta.persistence.*; import java.time.*;
@Entity public class Course{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; public String name; public String code; public LocalDateTime createdAt=LocalDateTime.now(); @ManyToOne public User professor; }
