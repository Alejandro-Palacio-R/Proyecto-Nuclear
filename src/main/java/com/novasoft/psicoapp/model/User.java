package com.novasoft.psicoapp.model;
import jakarta.persistence.*; import java.time.*;
@Entity @Table(name="users") public class User{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; @Column(unique=true,nullable=false) public String email; public String name; @Column(nullable=false) public String password; @Enumerated(EnumType.STRING) public Role role; public boolean enabled=true; public LocalDateTime createdAt=LocalDateTime.now(); }
