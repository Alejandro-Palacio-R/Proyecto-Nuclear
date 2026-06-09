package com.novasoft.psicoapp.model; import jakarta.persistence.*; import java.time.*;
@Entity public class Notification{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; @ManyToOne public User user; public String title; @Column(length=1200) public String message; public boolean readFlag=false; public LocalDateTime createdAt=LocalDateTime.now(); }
